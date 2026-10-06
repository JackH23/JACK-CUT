export type FontOption = {
  id: number;
  name: string;
  font_family: string;
  is_active: boolean;
  sort_order: number;
  createdAt: string;
  updatedAt: string;
};

export type GetFontOptionsResponse = {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  fonts: FontOption[];
};