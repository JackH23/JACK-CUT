"use client";

import {
  Copy,
  RotateCcw,
  Trash2,
  Type,
} from "lucide-react";

import SettingsContent from "./SettingsContent";

import {
  SETTINGS_TABS,
  type SettingsPanelProps,
} from "@/lib/types";

import { useSettingsPanel } from "@/composables/useSettingsPanel";

export default function SettingsPanel({
  activeItem,
  onDuplicate,
  canDuplicate = false,
  onUpdateTextFontSize,
  onUpdateTextFontWeight,
  onUpdateTextFontFamily,
  onUpdateTextColor,
}: SettingsPanelProps) {
  const {
    activeTab,
    animationAmount,
    scale,
    opacity,
    speedMode,

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
  } = useSettingsPanel({
    activeItem,
    onUpdateTextFontSize,
    onUpdateTextFontWeight,
    onUpdateTextFontFamily,
    onUpdateTextColor,
  });

  return (
    <aside className="flex h-full w-[370px] shrink-0 flex-col border-l border-white/10 bg-[#111218] text-white">
      {/* Selected item */}
      <header className="flex h-12 shrink-0 flex-col justify-center border-b border-white/10 px-4">
        <div className="flex items-center gap-2">
          <Type
            size={15}
            className="text-purple-300"
          />

          <p className="truncate text-sm font-semibold">
            {itemTitle}
          </p>

          <RotateCcw
            size={15}
            className="ml-auto text-purple-300"
          />
        </div>

        {itemMeta && (
          <p className="mt-1 font-mono text-[11px] text-zinc-400">
            {itemMeta}
          </p>
        )}
      </header>

      {/* Tabs */}
      <div
        role="tablist"
        aria-label="Settings"
        className="flex shrink-0 border-b border-white/10"
      >
        {SETTINGS_TABS.map((tab) => {
          const isActive =
            activeTab === tab;

          return (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() =>
                handleTabChange(tab)
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
      <SettingsContent
        activeItem={activeItem}
        activeTab={activeTab}
        scale={scale}
        opacity={opacity}
        speedMode={speedMode}
        animationAmount={
          animationAmount
        }
        onScaleChange={setScale}
        onOpacityChange={setOpacity}
        onSpeedModeChange={
          setSpeedMode
        }
        onAnimationAmountChange={
          setAnimationAmount
        }
        onFontSizeChange={
          handleFontSizeChange
        }
        onFontWeightChange={
          handleFontWeightChange
        }
        onFontFamilyChange={
          handleFontFamilyChange
        }
        onTextColorChange={
          handleTextColorChange
        }
      />

      {/* Actions */}
      {activeItem && (
        <footer className="grid grid-cols-[1fr_84px] gap-1 border-t border-white/10 p-2">
          <button
            type="button"
            onClick={onDuplicate}
            disabled={!canDuplicate}
            className="flex items-center justify-center gap-2 rounded bg-[#24262e] py-2 text-xs font-semibold hover:bg-[#30323c] disabled:cursor-not-allowed disabled:opacity-40"
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