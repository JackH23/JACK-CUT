import { api } from "./api";

import type {
  GetAnimationOptionsResponse,
} from "@/lib/animationOption";

export const animationOptionService = {
  async getAll(
    page = 1,
    limit = 10,
  ): Promise<GetAnimationOptionsResponse> {
    const { data } =
      await api.get<GetAnimationOptionsResponse>(
        "/animation-options",
        {
          params: {
            page,
            limit,
          },
        },
      );

    return data;
  },
};