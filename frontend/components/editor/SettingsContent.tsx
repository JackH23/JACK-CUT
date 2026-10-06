"use client";

import type { TimelineItem } from "@/types/timeline";

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
  animationAmount: number;

  onScaleChange: (
    scale: number,
  ) => void;

  onOpacityChange: (
    opacity: number,
  ) => void;

  onSpeedModeChange: (
    speedMode: "normal" | "curve",
  ) => void;

  onAnimationAmountChange: (
    amount: number,
  ) => void;

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
  animationAmount,

  onScaleChange,
  onOpacityChange,
  onSpeedModeChange,
  onAnimationAmountChange,

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
        <AnimationTab
          animationAmount={
            animationAmount
          }
          onAnimationAmountChange={
            onAnimationAmountChange
          }
        />
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