"use client";

import type {MediaAnimationSettings} from "@/lib/mediaAnimation";
import type {
  TimelineItem,
} from "@/types/timeline";

import BasicTab from "./settings-tabs/BasicTab";
import AnimationTab from "./settings-tabs/AnimationTab";
import TextSettings from "./settings-tabs/TextSettings";

export type SettingsTab =
  | "Basic"
  | "Animation"
  | "Style";

export type SettingsContentProps = {
  activeItem: TimelineItem | null;
  activeTab: SettingsTab;

  scale: number;
  opacity: number;
  speedMode: "normal" | "curve";

  onScaleChange: (
    scale: number,
  ) => void;

  onOpacityChange: (
    opacity: number,
  ) => void;

  onSpeedModeChange: (
    speedMode: "normal" | "curve",
  ) => void;

  // Animation
  onAnimationChange: (settings:MediaAnimationSettings) => void;

  // Text
  onFontSizeChange: (
    fontSize: number,
  ) => void;

  onFontWeightChange: (
    fontWeight: number,
  ) => void;

  onFontFamilyChange: (
    fontFamily: string,
  ) => void;

  onTextColorChange: (
    textColor: string,
  ) => void;
};

export default function SettingsContent({
  activeItem,
  activeTab,

  scale,
  opacity,
  speedMode,

  onScaleChange,
  onOpacityChange,
  onSpeedModeChange,

  onAnimationChange,

  onFontSizeChange,
  onFontWeightChange,
  onFontFamilyChange,
  onTextColorChange,
}: SettingsContentProps) {
  return (
    <div className="media-scrollbar flex-1 overflow-y-auto">
      {/* BASIC */}
      {activeTab === "Basic" && (
        <BasicTab
          positionX={activeItem?.type === "media" ? activeItem.mediaX ?? 0 : 0}
          positionY={activeItem?.type === "media" ? activeItem.mediaY ?? 0 : 0}
          scale={scale}
          opacity={opacity}
          speedMode={speedMode}
          onScaleChange={
            onScaleChange
          }
          onOpacityChange={
            onOpacityChange
          }
          onSpeedModeChange={
            onSpeedModeChange
          }
        />
      )}

      {/* ANIMATION */}
      {activeTab === "Animation" && (
        <>
          {activeItem ? (
            <AnimationTab
              item={activeItem}
              onAnimationChange={onAnimationChange}
            />
          ) : (
            <div className="p-4 text-sm text-zinc-500">
              Select a clip to edit its
              animation.
            </div>
          )}
        </>
      )}

      {/* STYLE */}
      {activeTab === "Style" && (
        <>
          {activeItem?.type === "text" ? (
            <TextSettings
              item={activeItem}
              onFontSizeChange={
                onFontSizeChange
              }
              onFontWeightChange={
                onFontWeightChange
              }
              onFontFamilyChange={
                onFontFamilyChange
              }
              onTextColorChange={
                onTextColorChange
              }
            />
          ) : (
            <div className="p-4 text-sm text-zinc-500">
              Select a text clip to edit
              its style.
            </div>
          )}
        </>
      )}
    </div>
  );
}