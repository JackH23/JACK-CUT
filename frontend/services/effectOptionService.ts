import { api } from "./api";
import type {
  EffectOptionsResponse,
} from "@/lib/effectOption";

export const effectOptionService = {
  async getAll(page = 1, limit = 100) {
    const response = await api.get<EffectOptionsResponse>(
      "/effect-options",
      {
        params: { page, limit },
      },
    );

    return response.data;
  },
};