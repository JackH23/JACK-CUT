export type EffectOption = {
  value: string;
  name: string;
  is_active: boolean;
  sort_order: number;
};

export type EffectOptionsResponse = {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  effectOptions: EffectOption[];
};