export type RegisterState = {
  loading: boolean;
  error: string;
  success: boolean;
};

export const initialRegisterState: RegisterState = {
  loading: false,
  error: "",
  success: false,
};

type RegisterAction =
  | { type: "REGISTER_START" }
  | { type: "REGISTER_SUCCESS" }
  | { type: "REGISTER_ERROR"; payload: string }
  | { type: "CLEAR_ERROR" };

export function registerReducer(
  state: RegisterState,
  action: RegisterAction,
): RegisterState {
  switch (action.type) {
    case "REGISTER_START":
      return {
        loading: true,
        error: "",
        success: false,
      };

    case "REGISTER_SUCCESS":
      return {
        loading: false,
        error: "",
        success: true,
      };

    case "REGISTER_ERROR":
      return {
        loading: false,
        error: action.payload,
        success: false,
      };

    case "CLEAR_ERROR":
      return {
        ...state,
        error: "",
      };

    default:
      return state;
  }
}