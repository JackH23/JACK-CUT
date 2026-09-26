"use client";

import { ChevronDown, Gauge, Layers3 } from "lucide-react";
import TransformSection from "../TransformSection";
import SettingGroup from "../SettingGroup";
import RangeControl from "../RangeControl";

type BasicTabProps = {
  scale: number;
  opacity: number;
  speedMode: "normal" | "curve";
  onScaleChange: (value: number) => void;
  onOpacityChange: (value: number) => void;
  onSpeedModeChange: (value: "normal" | "curve") => void;
};

export default function BasicTab({
  scale,
  opacity,
  speedMode,
  onScaleChange,
  onOpacityChange,
  onSpeedModeChange,
}: BasicTabProps) {
  return (
    <>
      <TransformSection
        scale={scale}
        positionX={0}
        positionY={0}
        rotation={0}
        onScaleChange={onScaleChange}
        onFlipHorizontal={() => console.log("Flip horizontal")}
        onFlipVertical={() => console.log("Flip vertical")}
        onReset={() => onScaleChange(100)}
      />

      <SettingGroup
        title="Compositing"
        icon={<Layers3 size={16} />}
      >
        <label className="text-xs text-zinc-300">
          Blend Mode
        </label>

        <button
          type="button"
          className="mt-2 flex w-full items-center justify-between rounded bg-[#090a0f] px-2 py-2 text-xs"
        >
          Normal
          <ChevronDown size={14} />
        </button>

        <RangeControl
          label="Opacity"
          value={`${opacity} %`}
          min={0}
          max={100}
          currentValue={opacity}
          onChange={onOpacityChange}
        />
      </SettingGroup>

      <SettingGroup
        title="Speed & Time"
        icon={<Gauge size={16} />}
        value="1.0x (Normal)"
      >
        <div className="grid grid-cols-2 gap-1">
          {(["normal", "curve"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => onSpeedModeChange(mode)}
              className={`rounded py-2 text-xs font-semibold ${
                speedMode === mode
                  ? "bg-purple-300 text-purple-950"
                  : "bg-[#090a0f] text-white"
              }`}
            >
              {mode === "normal"
                ? "Normal"
                : "Curve (Speed Ramp)"}
            </button>
          ))}
        </div>

        <label className="mt-3 flex items-center justify-between text-xs">
          Maintain Audio Pitch
          <input
            type="checkbox"
            defaultChecked
            className="accent-purple-400"
          />
        </label>
      </SettingGroup>
    </>
  );
}