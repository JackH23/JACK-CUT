import { api } from "./api";

import type {
  GetFontOptionsResponse,
} from "@/lib/fontOption";

export const fontOptionService = {
  async getAll(
    page = 1,
    limit = 6,
  ): Promise<GetFontOptionsResponse> {
    const { data } =
      await api.get<GetFontOptionsResponse>(
        "/font-options",
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