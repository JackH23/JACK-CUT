
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

  const [state, dispatch] = useReducer(
    projectsReducer,
    initialProjectsState,
  );

  // Delete project state
  const [projectToDelete, setProjectToDelete] =
    useState<Project | null>(null);

  const [deleting, setDeleting] = useState(false);

  const deletingRef = useRef(false);
  const creatingRef = useRef(false);

  useEffect(() => {
    let active = true;

    dispatch({ type: "LOAD_START" });

    projectService
      .getAll()
      .then((projects) => {
        if (active) {
          dispatch({
            type: "LOAD_SUCCESS",
            payload: projects,
          });
        }
      })
      .catch((cause: unknown) => {
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
      });

    return () => {
      active = false;
    };
  }, [router]);

  async function handleCreate(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    const trimmedName = name.trim();

    if (!trimmedName || creatingRef.current) return;

    creatingRef.current = true;

    dispatch({ type: "CREATE_START" });

    try {
      const project = await projectService.create(
        trimmedName,
      );

      dispatch({ type: "CREATE_SUCCESS" });

      router.push(`/editor/${project.id}`);
    } catch (cause) {
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

  // Open the delete confirmation modal
  const requestDelete = useCallback(
    (project: Project) => {
      if (deletingRef.current) return;

      dispatch({ type: "DELETE_START" });
      setProjectToDelete(project);
    },
    [],
  );

  // Close the modal without deleting anything
  const cancelDelete = useCallback(() => {
    if (deletingRef.current) return;

    setProjectToDelete(null);
  }, []);

  // Delete the selected project after confirmation
  const confirmDelete = useCallback(async () => {
    if (!projectToDelete || deletingRef.current) return;

    deletingRef.current = true;
    setDeleting(true);
    dispatch({ type: "DELETE_START" });

    const projectId = projectToDelete.id;

    try {
      await projectService.delete(projectId);

      // Remove the deleted project from the list
      dispatch({
        type: "DELETE_SUCCESS",
        payload: projectId,
      });

      setProjectToDelete(null);
    } catch (cause) {
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
  }, [projectToDelete, router]);

  return {
    name,
    setName,

    projects: state.projects,
    loading: state.loading,
    creating: state.creating,
    error: state.error,

    handleCreate,

    // Delete project
    projectToDelete,
    deleting,
    requestDelete,
    cancelDelete,
    confirmDelete,
  };
}
