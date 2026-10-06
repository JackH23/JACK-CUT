import type { TimelineItem } from "@/types/timeline";

export const SETTINGS_TABS = [
  "Basic",
  "Animation",
  "Style",
] as const;

export type SettingsTab =
  (typeof SETTINGS_TABS)[number];

export type SpeedMode =
  | "normal"
  | "curve";

export type SettingsPanelProps = {
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

export type SettingsContentProps = {
  activeItem: TimelineItem | null;
  activeTab: SettingsTab;

  scale: number;
  opacity: number;
  speedMode: SpeedMode;
  animationAmount: number;

  onScaleChange: (
    value: number,
  ) => void;

  onOpacityChange: (
    value: number,
  ) => void;

  onSpeedModeChange: (
    value: SpeedMode,
  ) => void;

  onAnimationAmountChange: (
    value: number,
  ) => void;

  onFontSizeChange: (
    value: number,
  ) => void;

  onFontWeightChange: (
    value: number,
  ) => void;

  onFontFamilyChange: (
    value: string,
  ) => void;

  onTextColorChange: (
    value: string,
  ) => void;
};

export type UseSettingsPanelProps =
  SettingsPanelProps;