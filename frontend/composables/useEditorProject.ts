"use client";

import { useEffect, useState } from "react";
import { projectService } from "@/services/projectService";
import type { Project } from "@/lib/project";

export function useEditorProject(projectId: string) {
  const [project, setProject] = useState<Project | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    setProject(null);
    setError("");

    projectService
      .getProjectById(projectId)
      .then((result) => {
        if (active) setProject(result);
      })
      .catch(() => {
        if (active) setError("Could not load this project.");
      });

    return () => {
      active = false;
    };
  }, [projectId]);

  return { project, error };
}