import { api } from "./api";
import type {
  CreateProjectResponse,
  GetProjectsResponse,
  Project,
} from "@/lib/project";

export const projectService = {
  async getAll(): Promise<Project[]> {
    const { data } = await api.get<GetProjectsResponse>("/projects");
    return data.projects;
  },

  async getProjectById(id: string): Promise<Project> {
    const projects = await projectService.getAll();
    const project = projects.find((item) => item.id === id);

    if (!project) {
      throw new Error("Project not found");
    }

    return project;
  },

  async create(name: string): Promise<Project> {
    const { data } = await api.post<CreateProjectResponse>("/projects", {
      name,
    });

    return data.project;
  },
};
export type { Project } from "@/lib/project";
