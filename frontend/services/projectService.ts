import axios from "axios";

export type Project = {
  id: string;
  name: string;
};

const PROJECTS_URL = `${process.env.NEXT_PUBLIC_API_URL}/api/projects`;

export const projectService = {
  async getAll(): Promise<Project[]> {
    const { data } = await axios.get<{ projects: Project[] }>(PROJECTS_URL);
    return data.projects;
  },

  async create(name: string): Promise<Project> {
    const { data } = await axios.post<{ project: Project }>(PROJECTS_URL, {
      name,
    });
    return data.project;
  },
};