export type Project = {
  id: string;
  name: string;
};

export type GetProjectsResponse = {
  projects: Project[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
};

export type CreateProjectResponse = {
  project: Project;
};