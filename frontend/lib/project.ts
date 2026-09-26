export type Project = {
  id: string;
  name: string;
};

export type GetProjectsResponse = {
  projects: Project[];
};

export type CreateProjectResponse = {
  project: Project;
};