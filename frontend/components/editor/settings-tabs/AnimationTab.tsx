"use client";

import { useState } from "react";
import {
  Gauge,
  Layers3,
  Sparkles,
} from "lucide-react";

import RangeControl from "../RangeControl";
import SettingGroup from "../SettingGroup";

import {
  animationIcons,
} from "@/lib/animationIcons";

import LoadingState from "@/components/shared/LoadingState";
import SelectableCard from "@/components/shared/SelectableCard";

import {
  useAnimationOptions,
} from "@/composables/useAnimationOptions";

type AnimationTabProps = {
  animationAmount: number;
  onAnimationAmountChange: (value: number) => void;
};

export default function AnimationTab({
  animationAmount,
  onAnimationAmountChange,
}: AnimationTabProps) {
  const [selectedPreset, setSelectedPreset] =
    useState<string>("none");

  const {
    animationOptions,
    loading,
    error,
  } = useAnimationOptions();

  return (
    <>
      <SettingGroup
        title="Clip Animation"
        icon={<Gauge size={16} />}
      >
        <p className="text-xs text-zinc-300">
          Animation Preset
        </p>

        {loading ? (
          <LoadingState
            message="Loading animations..."
          />
        ) : error ? (
          <p className="mt-2 text-xs text-red-400">
            {error}
          </p>
        ) : (
          <div className="mt-2 grid grid-cols-2 gap-2">
            {animationOptions.map((preset) => {
              const Icon =
                animationIcons[
                  preset.icon as keyof typeof animationIcons
                ] ?? Sparkles;

              const isSelected =
                selectedPreset === preset.value;

              return (
                <SelectableCard
                  key={preset.id}
                  isSelected={isSelected}
                  onClick={() =>
                    setSelectedPreset(
                      preset.value,
                    )
                  }
                  ariaLabel={`Select ${preset.name} animation`}
                >
                  <Icon
                    size={20}
                    className={
                      isSelected
                        ? "text-purple-300"
                        : "text-zinc-300"
                    }
                  />

                  <span className="mt-2 text-xs">
                    {preset.name}
                  </span>
                </SelectableCard>
              );
            })}
          </div>
        )}

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