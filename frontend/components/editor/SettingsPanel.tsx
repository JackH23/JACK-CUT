"use client";

import { useState } from "react";
import { Copy, RotateCcw, Trash2 } from "lucide-react";

import BasicTab from "./settings-tabs/BasicTab";
import AnimationTab from "./settings-tabs/AnimationTab";
import ColorLutTab from "./settings-tabs/ColorLutTab";
import AudioTab from "./settings-tabs/AudioTab";

const SETTINGS_TABS = ["Basic", "Animation", "Color / LUT", "Audio"] as const;

type SettingsTab = (typeof SETTINGS_TABS)[number];

export default function SettingsPanel() {
  const [activeTab, setActiveTab] = useState<SettingsTab>("Basic");

  const [animationAmount, setAnimationAmount] = useState(50);
  const [lutIntensity, setLutIntensity] = useState(100);
  const [volume, setVolume] = useState(80);
  const [pan, setPan] = useState(0);

  const [scale, setScale] = useState(105);
  const [opacity, setOpacity] = useState(100);
  const [speedMode, setSpeedMode] = useState<"normal" | "curve">("normal");

  return (
    <aside className="flex h-full w-[370px] shrink-0 flex-col border-l border-white/10 bg-[#111218] text-white">
      {/* Selected clip */}
      <header className="flex h-12 shrink-0 flex-col justify-center border-b border-white/10 px-4">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-sm bg-purple-300" />

          <p className="truncate text-sm font-semibold">
            Drone_Sunset_Coast.mp4
          </p>

          <RotateCcw size={15} className="ml-auto text-purple-300" />
        </div>

        <p className="mt-1 font-mono text-[11px] text-zinc-400">
          Clip 04 · 00:01:12:00 – 00:01:38:18
        </p>
      </header>

      {/* Tabs */}
      <div
        role="tablist"
        aria-label="Clip settings"
        className="flex border-b border-white/10"
      >
        {SETTINGS_TABS.map((tab) => {
          const isActive = activeTab === tab;

          return (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActiveTab(tab)}
              className={`relative flex-1 py-3 text-xs font-semibold ${
                isActive ? "text-purple-300" : "text-zinc-300 hover:bg-white/5"
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

      <div className="media-scrollbar flex-1 overflow-y-auto">
        {activeTab === "Basic" && (
          <BasicTab
            scale={scale}
            opacity={opacity}
            speedMode={speedMode}
            onScaleChange={setScale}
            onOpacityChange={setOpacity}
            onSpeedModeChange={setSpeedMode}
          />
        )}

        {activeTab === "Animation" && (
          <AnimationTab
            animationAmount={animationAmount}
            onAnimationAmountChange={setAnimationAmount}
          />
        )}

        {activeTab === "Color / LUT" && (
          <ColorLutTab
            lutIntensity={lutIntensity}
            onLutIntensityChange={setLutIntensity}
          />
        )}

        {activeTab === "Audio" && (
          <AudioTab
            volume={volume}
            pan={pan}
            onVolumeChange={setVolume}
            onPanChange={setPan}
          />
        )}
      </div>

      {/* Actions */}
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
    </aside>
  );
}
