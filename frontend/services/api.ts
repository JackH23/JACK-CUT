import axios, {
  AxiosError,
  type InternalAxiosRequestConfig,
} from "axios";

const baseURL = `${process.env.NEXT_PUBLIC_API_URL}/api`;

export const api = axios.create({ baseURL });

type RetryConfig = InternalAxiosRequestConfig & {
  _retry?: boolean;
};

type RefreshResponse = {
  token: string;
  refreshToken?: string;
};

let refreshRequest: Promise<string> | null = null;

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("accessToken");

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const request = error.config as RetryConfig | undefined;

    if (
      error.response?.status !== 401 ||
      !request ||
      request._retry ||
      request.url?.startsWith("/auth/login") ||
      request.url?.startsWith("/auth/register")
    ) {
      return Promise.reject(error);
    }

    const refreshToken = localStorage.getItem("refreshToken");

    if (!refreshToken) {
      return Promise.reject(error);
    }

    request._retry = true;

    try {
      refreshRequest ??= axios
        .post<RefreshResponse>(`${baseURL}/auth/refresh-token`, {
          refreshToken,
        })
        .then(({ data }) => {
          localStorage.setItem("accessToken", data.token);

          // Some backends rotate the refresh token; others keep the old one.
          if (data.refreshToken) {
            localStorage.setItem("refreshToken", data.refreshToken);
          }

          return data.token;
        })
        .finally(() => {
          refreshRequest = null;
        });

      const newToken = await refreshRequest;
      request.headers.Authorization = `Bearer ${newToken}`;

      return api(request);
    } catch (refreshError) {
      // An invalid or expired refresh token ends the session.
      // A network/server failure should not erase a valid refresh token.
      if (
        axios.isAxiosError(refreshError) &&
        [400, 401, 403].includes(refreshError.response?.status ?? 0)
      ) {
        localStorage.removeItem("accessToken");
        localStorage.removeItem("refreshToken");
        // Preserve the original 401 so callers redirect after session expiry,
        // including refresh endpoints that reject with 400 or 403.
        return Promise.reject(error);
      }

      return Promise.reject(refreshError);
    }
  },
);