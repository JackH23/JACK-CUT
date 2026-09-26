import type { User } from "@/lib/auth";

export type NavbarState = {
  user: User | null;
  loading: boolean;
  error: string | null;
};

export const initialNavbarState: NavbarState = {
  user: null,
  loading: true,
  error: null,
};

type NavbarAction =
  | { type: "USER_LOAD_START" }
  | { type: "USER_LOAD_SUCCESS"; payload: User }
  | { type: "USER_LOAD_ERROR"; payload: string }
  | { type: "USER_LOGGED_OUT" };

export function navbarReducer(
  state: NavbarState,
  action: NavbarAction,
): NavbarState {
  switch (action.type) {
    case "USER_LOAD_START":
      return { ...state, loading: true, error: null };

    case "USER_LOAD_SUCCESS":
      return {
        ...state,
        user: action.payload,
        loading: false,
        error: null,
      };

    case "USER_LOAD_ERROR":
      return {
        ...state,
        user: null,
        loading: false,
        error: action.payload,
      };

    case "USER_LOGGED_OUT":
      return {
        ...state,
        user: null,
        loading: false,
        error: null,
      };

    default:
      return state;
  }
}