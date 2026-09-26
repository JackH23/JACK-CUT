"use client";

import { Gauge, Layers3 } from "lucide-react";
import SettingGroup from "../SettingGroup";
import RangeControl from "../RangeControl";

type AnimationTabProps = {
  animationAmount: number;
  onAnimationAmountChange: (value: number) => void;
};

export default function AnimationTab({
  animationAmount,
  onAnimationAmountChange,
}: AnimationTabProps) {
  return (
    <>
      <SettingGroup
        title="Clip Animation"
        icon={<Gauge size={16} />}
      >
        <label className="text-xs text-zinc-300">
          Animation Preset
        </label>

        <select className="mt-2 w-full rounded bg-[#090a0f] px-2 py-2 text-xs outline-none">
          <option>None</option>
          <option>Fade In</option>
          <option>Fade Out</option>
          <option>Zoom In</option>
          <option>Zoom Out</option>
          <option>Slide Left</option>
          <option>Slide Right</option>
        </select>

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