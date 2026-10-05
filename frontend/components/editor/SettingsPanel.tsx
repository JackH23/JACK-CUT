"use client";

import { useEffect, useState } from "react";
import {
  Copy,
  RotateCcw,
  Trash2,
  Type,
} from "lucide-react";

import type { TimelineItem } from "@/types/timeline";

import BasicTab from "./settings-tabs/BasicTab";
import AnimationTab from "./settings-tabs/AnimationTab";
import ColorLutTab from "./settings-tabs/ColorLutTab";
import AudioTab from "./settings-tabs/AudioTab";
import TextSettings from "./settings-tabs/TextSettings";

const MEDIA_TABS = [
  "Basic",
  "Animation",
  "Color / LUT",
  "Audio",
] as const;

const TEXT_TABS = [
  "Basic",
  "Animation",
  "Style",
] as const;

type SettingsTab =
  | (typeof MEDIA_TABS)[number]
  | (typeof TEXT_TABS)[number];

type SettingsPanelProps = {
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

export default function SettingsPanel({
  activeItem,
  onUpdateTextFontSize,
  onUpdateTextFontWeight,
  onUpdateTextFontFamily,
  onUpdateTextColor,
}: SettingsPanelProps) {
  const [activeTab, setActiveTab] =
    useState<SettingsTab>("Basic");

  const [
    animationAmount,
    setAnimationAmount,
  ] = useState(50);

  const [lutIntensity, setLutIntensity] =
    useState(100);

  const [volume, setVolume] =
    useState(80);

  const [pan, setPan] =
    useState(0);

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

  const tabs = isTextItem
    ? TEXT_TABS
    : MEDIA_TABS;

  /*
   * When switching between media/text,
   * make sure the selected tab exists.
   *
   * Example:
   * Media -> Audio
   * then Text selected
   * -> reset to Basic.
   */
  useEffect(() => {
    const tabExists = tabs.some(
      (tab) => tab === activeTab,
    );

    if (!tabExists) {
      setActiveTab("Basic");
    }
  }, [activeTab, tabs]);

  return (
    <aside className="flex h-full w-[370px] shrink-0 flex-col border-l border-white/10 bg-[#111218] text-white">
      {/* Selected item */}
      <header className="flex h-12 shrink-0 flex-col justify-center border-b border-white/10 px-4">
        <div className="flex items-center gap-2">
          {isTextItem ? (
            <Type
              size={15}
              className="text-purple-300"
            />
          ) : (
            <span className="h-2.5 w-2.5 rounded-sm bg-purple-300" />
          )}

          <p className="truncate text-sm font-semibold">
            {isTextItem
              ? activeItem.text || "Text"
              : activeItem?.file?.name ||
                "No clip selected"}
          </p>

          <RotateCcw
            size={15}
            className="ml-auto text-purple-300"
          />
        </div>

        {activeItem && (
          <p className="mt-1 font-mono text-[11px] text-zinc-400">
            {isTextItem
              ? `${
                  activeItem.textStyle ??
                  "text"
                } · ${activeItem.duration.toFixed(
                  2,
                )}s`
              : `${activeItem.startTime.toFixed(
                  2,
                )}s – ${(
                  activeItem.startTime +
                  activeItem.duration
                ).toFixed(2)}s`}
          </p>
        )}
      </header>

      {/* Tabs */}
      <div
        role="tablist"
        aria-label={
          isTextItem
            ? "Text settings"
            : "Clip settings"
        }
        className="flex shrink-0 border-b border-white/10"
      >
        {tabs.map((tab) => {
          const isActive =
            activeTab === tab;

          return (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() =>
                setActiveTab(tab)
              }
              className={`relative flex-1 py-3 text-xs font-semibold ${
                isActive
                  ? "text-purple-300"
                  : "text-zinc-300 hover:bg-white/5"
              }`}
            >
              {tab}

              {isActive && (
                <span className="absolute inset-x-3 bottom-0 h-0.5 bg-purple-400" />
              )}
            </button>
          );
        })}
      </div>

      {/* Settings content */}
      <div className="media-scrollbar flex-1 overflow-y-auto">
        {/* BASIC */}
        {activeTab === "Basic" && (
          <BasicTab
            scale={scale}
            opacity={opacity}
            speedMode={speedMode}
            onScaleChange={setScale}
            onOpacityChange={
              setOpacity
            }
            onSpeedModeChange={
              setSpeedMode
            }
          />
        )}

        {/* ANIMATION */}
        {activeTab ===
          "Animation" && (
          <AnimationTab
            animationAmount={
              animationAmount
            }
            onAnimationAmountChange={
              setAnimationAmount
            }
          />
        )}

        {/* TEXT STYLE */}
        {activeItem?.type === "text" &&
          activeTab === "Style" && (
            <TextSettings
              item={activeItem}
              onFontSizeChange={(
                fontSize: number,
              ) =>
                onUpdateTextFontSize(
                  activeItem.id,
                  fontSize,
                )
              }
              onFontWeightChange={(
                fontWeight: number,
              ) =>
                onUpdateTextFontWeight(
                  activeItem.id,
                  fontWeight,
                )
              }
              onFontFamilyChange={(
                fontFamily: string,
              ) =>
                onUpdateTextFontFamily(
                  activeItem.id,
                  fontFamily,
                )
              }
              onTextColorChange={(
                textColor: string,
              ) =>
                onUpdateTextColor(
                  activeItem.id,
                  textColor,
                )
              }
            />
          )}

        {/* MEDIA COLOR / LUT */}
        {!isTextItem &&
          activeTab ===
            "Color / LUT" && (
            <ColorLutTab
              lutIntensity={
                lutIntensity
              }
              onLutIntensityChange={
                setLutIntensity
              }
            />
          )}

        {/* MEDIA AUDIO */}
        {!isTextItem &&
          activeTab === "Audio" && (
            <AudioTab
              volume={volume}
              pan={pan}
              onVolumeChange={
                setVolume
              }
              onPanChange={setPan}
            />
          )}
      </div>

      {/* Actions */}
      {activeItem && (
        <footer className="grid grid-cols-[1fr_84px] gap-1 border-t border-white/10 p-2">
          <button
            type="button"
            className="flex items-center justify-center gap-2 rounded bg-[#24262e] py-2 text-xs font-semibold hover:bg-[#30323c]"
          >
            <Copy size={15} />
            Duplicate
          </button>

          <button
            type="button"
            className="flex items-center justify-center gap-2 rounded bg-[#24262e] py-2 text-xs font-semibold text-red-400 hover:bg-red-950/40"
          >
            <Trash2 size={15} />
            Delete
          </button>
        </footer>
      )}
    </aside>
  );
}