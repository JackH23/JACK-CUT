"use client";

import { useCallback, useMemo, useState } from "react";

import type { TimelineItem } from "@/types/timeline";

export const SETTINGS_TABS = [
  "Basic",
  "Animation",
  "Style",
] as const;

export type SettingsTab =
  (typeof SETTINGS_TABS)[number];

type UseSettingsPanelProps = {
  activeItem: TimelineItem | null;

  onUpdateTextFontSize: (
    itemId: string,
    fontSize: number,
  ) => void;

  onUpdateTextFontWeight: (
    itemId: string,
    fontWeight: number,
  ) => void;

  onUpdateTextFontFamily: (
    itemId: string,
    fontFamily: string,
  ) => void;

  onUpdateTextColor: (
    itemId: string,
    textColor: string,
  ) => void;
};

export function useSettingsPanel({
  activeItem,
  onUpdateTextFontSize,
  onUpdateTextFontWeight,
  onUpdateTextFontFamily,
  onUpdateTextColor,
}: UseSettingsPanelProps) {
  const [activeTab, setActiveTab] =
    useState<SettingsTab>("Basic");

  const [
    animationAmount,
    setAnimationAmount,
  ] = useState(50);

  const [scale, setScale] =
    useState(105);

  const [opacity, setOpacity] =
    useState(100);

  const [speedMode, setSpeedMode] =
    useState<"normal" | "curve">(
      "normal",
    );

  const isTextItem =
    activeItem?.type === "text";

  const itemTitle = useMemo(() => {
    if (!activeItem) {
      return "No clip selected";
    }

    if (activeItem.type === "text") {
      return activeItem.text || "Text";
    }

    return (
      activeItem.file?.name ||
      "No clip selected"
    );
  }, [activeItem]);

  const itemMeta = useMemo(() => {
    if (!activeItem) {
      return null;
    }

    if (activeItem.type === "text") {
      return `${
        activeItem.textStyle ?? "text"
      } · ${activeItem.duration.toFixed(
        2,
      )}s`;
    }

    const endTime =
      activeItem.startTime +
      activeItem.duration;

    return `${activeItem.startTime.toFixed(
      2,
    )}s – ${endTime.toFixed(2)}s`;
  }, [activeItem]);

  const handleTabChange = useCallback(
    (tab: SettingsTab) => {
      setActiveTab(tab);
    },
    [],
  );

  const handleFontSizeChange =
    useCallback(
      (fontSize: number) => {
        if (
          activeItem?.type !== "text"
        ) {
          return;
        }

        onUpdateTextFontSize(
          activeItem.id,
          fontSize,
        );
      },
      [
        activeItem,
        onUpdateTextFontSize,
      ],
    );

  const handleFontWeightChange =
    useCallback(
      (fontWeight: number) => {
        if (
          activeItem?.type !== "text"
        ) {
          return;
        }

        onUpdateTextFontWeight(
          activeItem.id,
          fontWeight,
        );
      },
      [
        activeItem,
        onUpdateTextFontWeight,
      ],
    );

  const handleFontFamilyChange =
    useCallback(
      (fontFamily: string) => {
        if (
          activeItem?.type !== "text"
        ) {
          return;
        }

        onUpdateTextFontFamily(
          activeItem.id,
          fontFamily,
        );
      },
      [
        activeItem,
        onUpdateTextFontFamily,
      ],
    );

  const handleTextColorChange =
    useCallback(
      (textColor: string) => {
        if (
          activeItem?.type !== "text"
        ) {
          return;
        }

        onUpdateTextColor(
          activeItem.id,
          textColor,
        );
      },
      [
        activeItem,
        onUpdateTextColor,
      ],
    );

  return {
    activeTab,
    animationAmount,
    scale,
    opacity,
    speedMode,

    isTextItem,
    itemTitle,
    itemMeta,

    handleTabChange,

    setAnimationAmount,
    setScale,
    setOpacity,
    setSpeedMode,

    handleFontSizeChange,
    handleFontWeightChange,
    handleFontFamilyChange,
    handleTextColorChange,
  };
}