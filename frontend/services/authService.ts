import { api } from "./api";
import type {
  AuthResponse,
  LoginInput,
  MeResponse,
  RegisterInput,
  User,
} from "@/lib/auth";

function saveSession(data: AuthResponse) {
  localStorage.setItem("accessToken", data.token);
  localStorage.setItem("refreshToken", data.refreshToken);
}

export const authService = {
  async register(input: RegisterInput): Promise<User> {
    const { data } = await api.post<AuthResponse>("/auth/register", input);
    saveSession(data);
    return data.user;
  },

  async login(input: LoginInput): Promise<User> {
    const { data } = await api.post<AuthResponse>("/auth/login", input);
    saveSession(data);
    return data.user;
  },

  async me(): Promise<User> {
    const { data } = await api.get<MeResponse>("/auth/me");
    return data.user;
  },

  async logout(): Promise<void> {
    const refreshToken = localStorage.getItem("refreshToken");

    try {
      if (refreshToken) {
        await api.post("/auth/logout", { refreshToken });
      }
    } finally {
      localStorage.removeItem("accessToken");
      localStorage.removeItem("refreshToken");
    }
  },
};
export type { User } from "@/lib/auth";
