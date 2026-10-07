"use client";
import type {MediaAnimationSettings} from "@/lib/mediaAnimation";

import {
  useCallback,
  useMemo,
  useState,
} from "react";

import type {
  TimelineItem,
} from "@/types/timeline";

export const SETTINGS_TABS = [
  "Basic",
  "Animation",
  "Style",
] as const;

export type SettingsTab =
  (typeof SETTINGS_TABS)[number];

type UseSettingsPanelProps = {
  onUpdateMediaTransform: (id: string, values: { mediaScale: number; mediaX: number; mediaY: number }, persist?: boolean) => void;
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

  onUpdateAnimation: (itemId: string, settings: MediaAnimationSettings) => void;
};

export function useSettingsPanel({
  activeItem,
  onUpdateMediaTransform,
  onUpdateTextFontSize,
  onUpdateTextFontWeight,
  onUpdateTextFontFamily,
  onUpdateTextColor,
  onUpdateAnimation,
}: UseSettingsPanelProps) {
  const [activeTab, setActiveTab] =
    useState<SettingsTab>("Basic");

  const [textScale, setTextScale] = useState(105);
  const scale = activeItem?.type === "media" ? Math.round((activeItem.mediaScale ?? 1) * 10000) / 100 : textScale;
  const setScale = (value: number) => {
    if (activeItem?.type === "media" && activeItem.file?.type !== "audio") onUpdateMediaTransform(activeItem.id, { mediaScale: value / 100, mediaX: activeItem.mediaX ?? 0, mediaY: activeItem.mediaY ?? 0 });
    else setTextScale(value);
  };

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

  const handleAnimationChange=useCallback((settings:MediaAnimationSettings)=>{
    if(activeItem)onUpdateAnimation(activeItem.id,settings);
  },[activeItem,onUpdateAnimation]);

  return {
    activeTab,
    scale,
    opacity,
    speedMode,

    isTextItem,
    itemTitle,
    itemMeta,

    handleTabChange,

    setScale,
    setOpacity,
    setSpeedMode,

    handleFontSizeChange,
    handleFontWeightChange,
    handleFontFamilyChange,
    handleTextColorChange,

    handleAnimationChange,
  };
}