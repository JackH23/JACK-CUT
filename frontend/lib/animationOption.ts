export type AnimationOption = {
  id: number;
  name: string;
  value: string;
  icon: string;
  type: string;
  is_active: boolean;
  sort_order: number;
  createdAt: string;
  updatedAt: string;
};

export type GetAnimationOptionsResponse = {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  animationOptions: AnimationOption[];
};