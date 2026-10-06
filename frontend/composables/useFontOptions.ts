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
    async (currentPage: number) => {
      setLoading(true);
      setError(null);

      try {
        const response =
          await fontOptionService.getAll(
            currentPage,
            DEFAULT_LIMIT,
          );

        setFonts(response.fonts);
        setTotalPages(response.totalPages);
      } catch (error) {
        setError(
          error instanceof Error
            ? error.message
            : "Could not load fonts.",
        );
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    loadFonts(page);
  }, [page, loadFonts]);

  const nextPage = () => {
    setPage((current) =>
      Math.min(current + 1, totalPages),
    );
  };

  const previousPage = () => {
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