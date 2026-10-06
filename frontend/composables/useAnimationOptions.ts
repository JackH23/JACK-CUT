"use client";

import {
  useCallback,
  useEffect,
  useState,
} from "react";

import type {
  AnimationOption,
} from "@/lib/animationOption";

import {
  animationOptionService,
} from "@/services/animationOptionService";

const DEFAULT_LIMIT = 10;

export function useAnimationOptions() {
  const [animationOptions, setAnimationOptions] =
    useState<AnimationOption[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState<string | null>(null);

  const loadAnimationOptions =
    useCallback(async () => {
      setLoading(true);
      setError(null);

      try {
        const response =
          await animationOptionService.getAll(
            1,
            DEFAULT_LIMIT,
          );

        setAnimationOptions(
          response.animationOptions,
        );
      } catch (error) {
        setError(
          error instanceof Error
            ? error.message
            : "Could not load animation options.",
        );
      } finally {
        setLoading(false);
      }
    }, []);

  useEffect(() => {
    loadAnimationOptions();
  }, [loadAnimationOptions]);

  return {
    animationOptions,
    loading,
    error,
  };
}