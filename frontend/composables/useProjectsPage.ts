"use client";

import {
  useCallback,
  useEffect,
  useReducer,
  useRef,
  useState,
  type FormEvent,
} from "react";

import { useRouter } from "next/navigation";
import axios from "axios";

import { projectService } from "@/services/projectService";
import {
  initialProjectsState,
  projectsReducer,
} from "@/reducers/projectsReducer";

import type { Project } from "@/lib/project";

const DEFAULT_LIMIT = 12;

function getErrorMessage(
  error: unknown,
  fallback: string,
): string {
  if (axios.isAxiosError(error)) {
    const message = error.response?.data?.message;

    return typeof message === "string" && message.trim()
      ? message
      : fallback;
  }

  return error instanceof Error ? error.message : fallback;
}

export function useProjectsPage() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [requestedPage, setRequestedPage] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);

  const [state, dispatch] = useReducer(
    projectsReducer,
    initialProjectsState,
  );

  const [projectToDelete, setProjectToDelete] =
    useState<Project | null>(null);

  const [deleting, setDeleting] = useState(false);

  const deletingRef = useRef(false);
  const creatingRef = useRef(false);
  const changingPageRef = useRef(false);

  const [projectToRename, setProjectToRename] =
    useState<Project | null>(null);

  const [renameName, setRenameName] = useState("");
  const [renaming, setRenaming] = useState(false);
  const renamingRef = useRef(false);

  useEffect(() => {
    let active = true;

    dispatch({ type: "LOAD_START" });
    changingPageRef.current = true;

    async function loadProjects() {
      try {
        const response = await projectService.getAll(
          requestedPage,
          DEFAULT_LIMIT,
        );

        if (!active) return;

        // Recover if deletion elsewhere made this page empty.
        const lastPage = Math.max(1, response.totalPages);

        if (requestedPage > lastPage) {
          setRequestedPage(lastPage);
          return;
        }

        dispatch({
          type: "LOAD_SUCCESS",
          payload: response,
        });
      } catch (cause: unknown) {
        if (!active) return;

        if (
          axios.isAxiosError(cause) &&
          cause.response?.status === 401
        ) {
          router.replace("/login");
          return;
        }

        dispatch({
          type: "LOAD_ERROR",
          payload: getErrorMessage(
            cause,
            "Could not load projects.",
          ),
        });
      } finally {
        if (active) {
          changingPageRef.current = false;
        }
      }
    }

    void loadProjects();

    return () => {
      active = false;
    };
  }, [requestedPage, refreshKey, router]);

  const nextPage = useCallback(() => {
    if (
      state.loading ||
      !state.hasNextPage ||
      changingPageRef.current ||
      deletingRef.current ||
      renamingRef.current ||
      projectToDelete ||
      projectToRename
    ) {
      return;
    }

    changingPageRef.current = true;
    dispatch({ type: "LOAD_START" });
    setRequestedPage(state.page + 1);
  }, [
    state.loading,
    state.hasNextPage,
    state.page,
    projectToDelete,
    projectToRename,
  ]);

  const previousPage = useCallback(() => {
    if (
      state.loading ||
      !state.hasPreviousPage ||
      changingPageRef.current ||
      deletingRef.current ||
      renamingRef.current ||
      projectToDelete ||
      projectToRename
    ) {
      return;
    }

    changingPageRef.current = true;
    dispatch({ type: "LOAD_START" });
    setRequestedPage(Math.max(1, state.page - 1));
  }, [
    state.loading,
    state.hasPreviousPage,
    state.page,
    projectToDelete,
    projectToRename,
  ]);

  async function handleCreate(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    const trimmedName = name.trim();

    if (
      !trimmedName ||
      creatingRef.current ||
      deletingRef.current ||
      renamingRef.current ||
      projectToDelete ||
      projectToRename
    ) {
      return;
    }

    creatingRef.current = true;
    dispatch({ type: "CREATE_START" });

    try {
      const project = await projectService.create(trimmedName);

      dispatch({ type: "CREATE_SUCCESS" });
      router.push(`/editor/${project.id}`);
    } catch (cause: unknown) {
      if (
        axios.isAxiosError(cause) &&
        cause.response?.status === 401
      ) {
        dispatch({ type: "CREATE_SUCCESS" });
        router.replace("/login");
        return;
      }

      dispatch({
        type: "CREATE_ERROR",
        payload: getErrorMessage(
          cause,
          "Could not create project.",
        ),
      });
    } finally {
      creatingRef.current = false;
    }
  }

  const requestDelete = useCallback(
    (project: Project) => {
      if (
        deletingRef.current ||
        renamingRef.current ||
        changingPageRef.current ||
        state.loading ||
        projectToRename
      ) {
        return;
      }

      dispatch({ type: "DELETE_START" });
      setProjectToDelete(project);
    },
    [state.loading, projectToRename],
  );

  const cancelDelete = useCallback(() => {
    if (deletingRef.current) return;

    setProjectToDelete(null);
  }, []);

  const confirmDelete = useCallback(async () => {
    if (!projectToDelete || deletingRef.current) return;

    deletingRef.current = true;
    setDeleting(true);
    dispatch({ type: "DELETE_START" });

    const projectId = projectToDelete.id;

    try {
      await projectService.delete(projectId);

      dispatch({
        type: "DELETE_SUCCESS",
        payload: projectId,
      });

      setProjectToDelete(null);

      // Return to the previous page when its last item is deleted.
      const targetPage =
        state.projects.length === 1 && state.page > 1
          ? state.page - 1
          : state.page;

      // Reload to update totals and fill the page after deletion.
      changingPageRef.current = true;
      dispatch({ type: "LOAD_START" });
      setRequestedPage(targetPage);
      setRefreshKey((current) => current + 1);
    } catch (cause: unknown) {
      if (
        axios.isAxiosError(cause) &&
        cause.response?.status === 401
      ) {
        router.replace("/login");
        return;
      }

      dispatch({
        type: "DELETE_ERROR",
        payload: getErrorMessage(
          cause,
          "Could not delete project.",
        ),
      });
    } finally {
      deletingRef.current = false;
      setDeleting(false);
    }
  }, [
    projectToDelete,
    state.projects.length,
    state.page,
    router,
  ]);

  const requestRename = useCallback(
    (project: Project) => {
      if (
        state.loading ||
        changingPageRef.current ||
        creatingRef.current ||
        deletingRef.current ||
        renamingRef.current ||
        projectToDelete ||
        projectToRename
      ) {
        return;
      }

      dispatch({ type: "UPDATE_START" });
      setRenameName(project.name);
      setProjectToRename(project);
    },
    [state.loading, projectToDelete, projectToRename],
  );

  const cancelRename = useCallback(() => {
    if (renamingRef.current) return;

    setProjectToRename(null);
    setRenameName("");
    dispatch({ type: "UPDATE_START" });
  }, []);

  async function handleRename(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (!projectToRename || renamingRef.current) return;

    const trimmedName = renameName.trim();

    if (!trimmedName || trimmedName.length > 255) {
      dispatch({
        type: "UPDATE_ERROR",
        payload:
          "Project name is required and must be at most 255 characters.",
      });
      return;
    }

    if (trimmedName === projectToRename.name) {
      cancelRename();
      return;
    }

    renamingRef.current = true;
    setRenaming(true);
    dispatch({ type: "UPDATE_START" });

    try {
      const project = await projectService.updateName(
        projectToRename.id,
        trimmedName,
      );

      dispatch({
        type: "UPDATE_SUCCESS",
        payload: project,
      });

      setProjectToRename(null);
      setRenameName("");
    } catch (cause: unknown) {
      if (
        axios.isAxiosError(cause) &&
        cause.response?.status === 401
      ) {
        router.replace("/login");
        return;
      }

      dispatch({
        type: "UPDATE_ERROR",
        payload: getErrorMessage(
          cause,
          "Could not update project name.",
        ),
      });
    } finally {
      renamingRef.current = false;
      setRenaming(false);
    }
  }

  return {
    name,
    setName,

    projects: state.projects,
    total: state.total,
    page: state.page,
    limit: state.limit,
    totalPages: state.totalPages,
    hasNextPage: state.hasNextPage,
    hasPreviousPage: state.hasPreviousPage,

    loading: state.loading,
    creating: state.creating,
    error: state.error,

    nextPage,
    previousPage,
    handleCreate,

    projectToDelete,
    deleting,
    requestDelete,
    cancelDelete,
    confirmDelete,

    projectToRename,
    renameName,
    setRenameName,
    renaming,
    requestRename,
    cancelRename,
    handleRename,
  };
}