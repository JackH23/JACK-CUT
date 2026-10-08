"use client";

import { useEffect, useState } from "react";
import { projectService } from "@/services/projectService";
import type { Project } from "@/lib/project";

export function useEditorProject(projectId: string) {
  const [result, setResult] = useState<{ id: string; project: Project | null; error: string } | null>(null);
  useEffect(() => {
    let active = true;
    projectService.getProjectById(projectId)
      .then(project => { if (active) setResult({ id: projectId, project, error: "" }); })
      .catch(() => { if (active) setResult({ id: projectId, project: null, error: "Could not load this project." }); });
    return () => { active = false; };
  }, [projectId]);
  // A route change immediately hides the previous project without an effect reset.
  return result?.id === projectId ? result : { project: null, error: "" };
}
