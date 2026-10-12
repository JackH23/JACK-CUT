import type {
  GetProjectsResponse,
  Project,
} from "@/lib/project";

export type ProjectsState = {
  projects: Project[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  loading: boolean;
  creating: boolean;
  error: string;
};

export const initialProjectsState: ProjectsState = {
  projects: [],
  total: 0,
  page: 1,
  limit: 12,
  totalPages: 0,
  hasNextPage: false,
  hasPreviousPage: false,
  loading: true,
  creating: false,
  error: "",
};

type ProjectsAction =
  | { type: "LOAD_START" }
  | {
    type: "LOAD_SUCCESS";
    payload: GetProjectsResponse;
  }
  | { type: "LOAD_ERROR"; payload: string }
  | { type: "CREATE_START" }
  | { type: "CREATE_SUCCESS" }
  | { type: "CREATE_ERROR"; payload: string }
  | { type: "DELETE_START" }
  | { type: "DELETE_SUCCESS"; payload: string }
  | { type: "DELETE_ERROR"; payload: string }
  | { type: "UPDATE_START" }
  | { type: "UPDATE_SUCCESS"; payload: Project }
  | { type: "UPDATE_ERROR"; payload: string };

export function projectsReducer(
  state: ProjectsState,
  action: ProjectsAction,
): ProjectsState {
  switch (action.type) {
    case "LOAD_START":
      return {
        ...state,
        loading: true,
        error: "",
      };

    case "LOAD_SUCCESS":
      return {
        ...state,
        projects: action.payload.projects,
        total: action.payload.total,
        page: action.payload.page,
        limit: action.payload.limit,
        totalPages: action.payload.totalPages,
        hasNextPage: action.payload.hasNextPage,
        hasPreviousPage: action.payload.hasPreviousPage,
        loading: false,
        error: "",
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

    case "DELETE_START":
      return {
        ...state,
        error: "",
      };

    case "DELETE_SUCCESS": {
      const projects = state.projects.filter(
        (project) => project.id !== action.payload,
      );

      const wasVisible = projects.length < state.projects.length;
      const total = Math.max(
        0,
        state.total - (wasVisible ? 1 : 0),
      );
      const totalPages = Math.ceil(total / state.limit);

      return {
        ...state,
        projects,
        total,
        totalPages,
        hasNextPage: state.page < totalPages,
        hasPreviousPage: state.page > 1,
        error: "",
      };
    }

    case "DELETE_ERROR":
      return {
        ...state,
        error: action.payload,
      };

    case "UPDATE_START":
      return {
        ...state,
        error: "",
      };

    case "UPDATE_SUCCESS":
      return {
        ...state,
        projects: state.projects.map((project) =>
          project.id === action.payload.id
            ? { ...project, name: action.payload.name }
            : project,
        ),
        error: "",
      };

    case "UPDATE_ERROR":
      return {
        ...state,
        error: action.payload,
      };

    default:
      return state;
  }
}