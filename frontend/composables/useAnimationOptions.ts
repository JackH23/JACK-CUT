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
    useCallback(async (isActive: () => boolean) => {

      try {
        const response =
          await animationOptionService.getAll(
            1,
            DEFAULT_LIMIT,
          );

        if (!isActive()) return;
        setAnimationOptions(
          response.animationOptions,
        );
      } catch (error) {
        if (!isActive()) return;
        setError(
          error instanceof Error
            ? error.message
            : "Could not load animation options.",
        );
      } finally {
        if (isActive()) setLoading(false);
      }
    }, []);

  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => { if (active) return loadAnimationOptions(() => active); });
    return () => { active = false; };
  }, [loadAnimationOptions]);

  return {
    animationOptions,
    loading,
    error,
  };
}