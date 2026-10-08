"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import axios from "axios";
import { projectService } from "@/services/projectService";
import type { Project } from "@/lib/project";

export function useEditorProject(projectId: string) {
  const router = useRouter();
  const [result, setResult] = useState<{ id: string; project: Project | null; error: string } | null>(null);
  useEffect(() => {
    let active = true;
    projectService.getProjectById(projectId)
      .then(project => { if (active) setResult({ id: projectId, project, error: "" }); })
      .catch((cause: unknown) => {
        if (!active) return;
        if (axios.isAxiosError(cause) && cause.response?.status === 401) {
          router.replace("/login");
          return;
        }
        setResult({ id: projectId, project: null, error: "Could not load this project." });
      });
    return () => { active = false; };
  }, [projectId, router]);
  // A route change immediately hides the previous project without an effect reset.
  return result?.id === projectId ? result : { project: null, error: "" };
}
