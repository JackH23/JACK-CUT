import type {MediaAnimationSettings} from "@/lib/mediaAnimation";
import type { DragEvent, MouseEvent, PointerEvent } from "react";
import type { TimelineTrack } from "@/types/timeline";
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
  onUpdateMediaTransform: (id: string, values: { mediaScale: number; mediaX: number; mediaY: number }, persist?: boolean) => void;
  activeItem: TimelineItem | null;
  onDuplicate?: () => void;
  canDuplicate?: boolean;

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

  // Animation
  onUpdateAnimation: (itemId: string, settings: MediaAnimationSettings) => void;
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
export type ResizeEdge = "left" | "right";

export type TimelineTracksProps = {
  items: TimelineItem[];
  tracks: TimelineTrack[];
  selectedItemId: string | null;
  onSelectItem: (id: string) => void;
  onUpdateText: (id: string, text: string) => void;
  onTrackDragOver: (event: DragEvent<HTMLDivElement>, track: TimelineTrack) => void;
  onTrackDrop: (event: DragEvent<HTMLDivElement>, track: TimelineTrack) => void;
  onClipDragStart: (event: DragEvent<HTMLDivElement>, id: string) => void;
  onClipDragEnd: () => void;
  onResizeStart: (event: PointerEvent<HTMLButtonElement>, item: TimelineItem, edge: ResizeEdge) => void;
  onResizeMove: (event: PointerEvent<HTMLButtonElement>) => void;
  onResizeEnd: (event: PointerEvent<HTMLButtonElement>) => void;

  onAnimationDurationChange: (
    itemId: string,
    phase: "in" | "out",
    duration: number,
    persist: boolean,
  ) => void;

  onRemovePointerDown: (event: PointerEvent<HTMLButtonElement>) => void;
  onRemoveDragStart: (event: DragEvent<HTMLButtonElement>) => void;
  onRemoveClick: (event: MouseEvent<HTMLButtonElement>, id: string) => void;
};
