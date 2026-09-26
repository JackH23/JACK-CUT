export type LoginState = {
  loading: boolean;
  error: string;
  success: boolean;
};

export const initialLoginState: LoginState = {
  loading: false,
  error: "",
  success: false,
};

type LoginAction =
  | { type: "LOGIN_START" }
  | { type: "LOGIN_SUCCESS" }
  | { type: "LOGIN_ERROR"; payload: string }
  | { type: "CLEAR_ERROR" };

export function loginReducer(
  state: LoginState,
  action: LoginAction,
): LoginState {
  switch (action.type) {
    case "LOGIN_START":
      return { loading: true, error: "", success: false };

    case "LOGIN_SUCCESS":
      return { loading: false, error: "", success: true };

    case "LOGIN_ERROR":
      return {
        loading: false,
        error: action.payload,
        success: false,
      };

    case "CLEAR_ERROR":
      return { ...state, error: "" };

    default:
      return state;
  }
}