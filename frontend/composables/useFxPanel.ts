"use client";

import { useEffect, useMemo, useState } from "react";

import type { EffectOption } from "@/lib/effectOption";
import { getMediaEffectFilter } from "@/lib/mediaEffect";
import { effectOptionService } from "@/services/effectOptionService";

export function useFxPanel() {
  const [search, setSearch] = useState("");
  const [options, setOptions] = useState<EffectOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadEffects() {
      try {
        const response = await effectOptionService.getAll();

        if (active) {
          setOptions(response.effectOptions);
        }
      } catch (error) {
        if (active) {
          setError(
            error instanceof Error
              ? error.message
              : "Could not load effects.",
          );
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadEffects();

    return () => {
      active = false;
    };
  }, []);

  const effects = useMemo(() => {
    const query = search.trim().toLowerCase();

    return options
      .filter((effect) =>
        effect.name.toLowerCase().includes(query),
      )
      .map((effect) => ({
        id: effect.value,
        name: effect.name,
        filter: getMediaEffectFilter(effect.value),
      }));
  }, [options, search]);

  return {
    search,
    setSearch,
    effects,
    loading,
    error,
  };
}