"use client";

import { useEffect, useReducer, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import axios from "axios";

import { projectService } from "@/services/projectService";
import {
  initialProjectsState,
  projectsReducer,
} from "@/reducers/projectsReducer";

function getErrorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error)) {
    return error.response?.data?.message || fallback;
  }

  return error instanceof Error ? error.message : fallback;
}

export function useProjectsPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [state, dispatch] = useReducer(projectsReducer, initialProjectsState);

  useEffect(() => {
    let active = true;

    dispatch({ type: "LOAD_START" });

    projectService
      .getAll()
      .then((projects) => {
        if (active) {
          dispatch({ type: "LOAD_SUCCESS", payload: projects });
        }
      })
      .catch((cause: unknown) => {
        if (!active) return;

        if (axios.isAxiosError(cause) && cause.response?.status === 401) {
          router.replace("/login");
          return;
        }

        dispatch({
          type: "LOAD_ERROR",
          payload: getErrorMessage(cause, "Could not load projects."),
        });
      });

    return () => {
      active = false;
    };
  }, [router]);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedName = name.trim();
    if (!trimmedName || state.creating) return;

    dispatch({ type: "CREATE_START" });

    try {
      const project = await projectService.create(trimmedName);

      dispatch({ type: "CREATE_SUCCESS" });
      router.push(`/editor/${project.id}`);
    } catch (cause) {
      if (axios.isAxiosError(cause) && cause.response?.status === 401) {
        dispatch({ type: "CREATE_SUCCESS" });
        router.replace("/login");
        return;
      }

      dispatch({
        type: "CREATE_ERROR",
        payload: getErrorMessage(cause, "Could not create project."),
      });
    }
  }

  return {
    name,
    setName,
    projects: state.projects,
    loading: state.loading,
    creating: state.creating,
    error: state.error,
    handleCreate,
  };
}