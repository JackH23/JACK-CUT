"use client";

import { useState } from "react";
import {
  Ban,
  Gauge,
  Layers3,
  MoveLeft,
  MoveRight,
  Search,
  SearchX,
  Sparkles,
} from "lucide-react";

import RangeControl from "../RangeControl";
import SettingGroup from "../SettingGroup";
import SelectableCard from "@/components/shared/SelectableCard";

const animationPresets = [
  {
    value: "none",
    label: "None",
    icon: Ban,
  },
  {
    value: "fade-in",
    label: "Fade In",
    icon: Sparkles,
  },
  {
    value: "fade-out",
    label: "Fade Out",
    icon: Sparkles,
  },
  {
    value: "zoom-in",
    label: "Zoom In",
    icon: Search,
  },
  {
    value: "zoom-out",
    label: "Zoom Out",
    icon: SearchX,
  },
  {
    value: "slide-left",
    label: "Slide Left",
    icon: MoveLeft,
  },
  {
    value: "slide-right",
    label: "Slide Right",
    icon: MoveRight,
  },
] as const;

type AnimationPreset =
  (typeof animationPresets)[number]["value"];

type AnimationTabProps = {
  animationAmount: number;
  onAnimationAmountChange: (value: number) => void;
};

export default function AnimationTab({
  animationAmount,
  onAnimationAmountChange,
}: AnimationTabProps) {
  const [selectedPreset, setSelectedPreset] =
    useState<AnimationPreset>("none");

  return (
    <>
      <SettingGroup
        title="Clip Animation"
        icon={<Gauge size={16} />}
      >
        <p className="text-xs text-zinc-300">
          Animation Preset
        </p>

        <div className="mt-2 grid grid-cols-2 gap-2">
          {animationPresets.map((preset) => {
            const Icon = preset.icon;

            return (
              <SelectableCard
                key={preset.value}
                isSelected={
                  selectedPreset === preset.value
                }
                onClick={() =>
                  setSelectedPreset(preset.value)
                }
                ariaLabel={`Select ${preset.label} animation`}
              >
                <Icon
                  size={20}
                  className={
                    selectedPreset === preset.value
                      ? "text-purple-300"
                      : "text-zinc-300"
                  }
                />

                <span className="mt-2 text-xs">
                  {preset.label}
                </span>
              </SelectableCard>
            );
          })}
        </div>

        <RangeControl
          label="Animation Amount"
          value={`${animationAmount} %`}
          min={0}
          max={100}
          currentValue={animationAmount}
          onChange={onAnimationAmountChange}
        />
      </SettingGroup>

      <SettingGroup
        title="Keyframes"
        icon={<Layers3 size={16} />}
      >
        <button
          type="button"
          className="w-full rounded bg-purple-300 py-2 text-xs font-semibold text-purple-950"
        >
          Add Keyframe
        </button>

        <p className="mt-3 text-xs text-zinc-400">
          Animate position, scale, rotation and opacity.
        </p>
      </SettingGroup>
    </>
  );
}