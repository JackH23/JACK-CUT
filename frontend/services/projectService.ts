import { api } from "./api";

import type {
  CreateProjectResponse,
  GetProjectsResponse,
  Project,
} from "@/lib/project";

type DeleteProjectResponse = {
  message: string;
  projectId: string;
};

export const projectService = {
  async getAll(
    page = 1,
    limit = 12,
  ): Promise<GetProjectsResponse> {
    const { data } = await api.get<GetProjectsResponse>(
      "/projects",
      {
        params: {
          page,
          limit,
        },
      },
    );

    return data;
  },

  async getProjectById(id: string): Promise<Project> {
    const { data } = await api.get<{
      project: Project;
    }>(`/projects/${encodeURIComponent(id)}`);

    return data.project;
  },

  async create(name: string): Promise<Project> {
    const { data } = await api.post<CreateProjectResponse>(
      "/projects",
      { name },
    );

    return data.project;
  },

  async delete(id: string): Promise<DeleteProjectResponse> {
    const { data } = await api.delete<DeleteProjectResponse>(
      `/projects/${encodeURIComponent(id)}`,
    );

    return data;
  },
};

export type { Project } from "@/lib/project";