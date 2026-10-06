"use client";

import type { TextTimelineItem } from "@/types/timeline";
import { useFontOptions } from "@/composables/useFontOptions";

type UseTextSettingsProps = {
  item: TextTimelineItem;
  onFontFamilyChange: (fontFamily: string) => void;
};

const DEFAULT_FONT_SIZES = {
  heading: 48,
  title: 36,
  subtitle: 30,
  caption: 20,
} as const;

const DEFAULT_FONT_WEIGHTS = {
  heading: 700,
  title: 700,
  subtitle: 600,
  caption: 500,
} as const;

export function useTextSettings({
  item,
  onFontFamilyChange,
}: UseTextSettingsProps) {
  const textStyle =
    item.textStyle ?? "subtitle";

  const fontSize =
    item.fontSize ??
    DEFAULT_FONT_SIZES[textStyle];

  const fontWeight =
    item.fontWeight ??
    DEFAULT_FONT_WEIGHTS[textStyle];

  const selectedFontFamily =
    item.fontFamily ?? "Arial";

  const textColor =
    item.textColor ?? "#ffffff";

  const {
    fonts,
    page,
    totalPages,
    loading,
    error,
    nextPage,
    previousPage,
  } = useFontOptions();

  const isFontSelected = (
    fontFamily: string,
  ) => {
    return (
      selectedFontFamily === fontFamily
    );
  };

  const handleFontSelect = (
    fontFamily: string,
  ) => {
    onFontFamilyChange(fontFamily);
  };

  return {
    fontSize,
    fontWeight,
    textColor,

    fonts,
    page,
    totalPages,
    loading,
    error,

    isFontSelected,
    handleFontSelect,

    nextPage,
    previousPage,
  };
}