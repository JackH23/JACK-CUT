"use client";

import {
  useCallback,
  useEffect,
  useState,
} from "react";

import type {
  FontOption,
} from "@/lib/fontOption";

import {
  fontOptionService,
} from "@/services/fontOptionService";

const DEFAULT_LIMIT = 6;

export function useFontOptions() {
  const [fonts, setFonts] =
    useState<FontOption[]>([]);

  const [page, setPage] =
    useState(1);

  const [totalPages, setTotalPages] =
    useState(1);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState<string | null>(null);

  const loadFonts = useCallback(
    async (currentPage: number, isActive: () => boolean) => {

      try {
        const response =
          await fontOptionService.getAll(
            currentPage,
            DEFAULT_LIMIT,
          );

        if (!isActive()) return;
        setFonts(response.fonts);
        setTotalPages(response.totalPages);
      } catch (error) {
        if (!isActive()) return;
        setError(
          error instanceof Error
            ? error.message
            : "Could not load fonts.",
        );
      } finally {
        if (isActive()) setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => { if (active) return loadFonts(page, () => active); });
    return () => { active = false; };
  }, [page, loadFonts]);

  const nextPage = () => {
    if (page >= totalPages) return;
    setLoading(true); setError(null);
    setPage((current) =>
      Math.min(current + 1, totalPages),
    );
  };

  const previousPage = () => {
    if (page <= 1) return;
    setLoading(true); setError(null);
    setPage((current) =>
      Math.max(current - 1, 1),
    );
  };

  return {
    fonts,
    page,
    totalPages,
    loading,
    error,
    nextPage,
    previousPage,
  };
}