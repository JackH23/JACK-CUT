import type { Project } from "@/lib/project";

export type ProjectsState = {
  projects: Project[];
  loading: boolean;
  creating: boolean;
  error: string;
};

export const initialProjectsState: ProjectsState = {
  projects: [],
  loading: true,
  creating: false,
  error: "",
};

type ProjectsAction =
  | { type: "LOAD_START" }
  | { type: "LOAD_SUCCESS"; payload: Project[] }
  | { type: "LOAD_ERROR"; payload: string }
  | { type: "CREATE_START" }
  | { type: "CREATE_SUCCESS" }
  | { type: "CREATE_ERROR"; payload: string };

export function projectsReducer(
  state: ProjectsState,
  action: ProjectsAction,
): ProjectsState {
  switch (action.type) {
    case "LOAD_START":
      return { ...state, loading: true, error: "" };

    case "LOAD_SUCCESS":
      return {
        ...state,
        projects: action.payload,
        loading: false,
      };

    case "LOAD_ERROR":
      return {
        ...state,
        loading: false,
        error: action.payload,
      };

    case "CREATE_START":
      return {
        ...state,
        creating: true,
        error: "",
      };

    case "CREATE_SUCCESS":
      return {
        ...state,
        creating: false,
      };

    case "CREATE_ERROR":
      return {
        ...state,
        creating: false,
        error: action.payload,
      };

    default:
      return state;
  }
}