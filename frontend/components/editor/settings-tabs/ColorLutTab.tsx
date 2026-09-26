"use client";

import { Layers3 } from "lucide-react";
import SettingGroup from "../SettingGroup";
import RangeControl from "../RangeControl";

type ColorLutTabProps = {
  lutIntensity: number;
  onLutIntensityChange: (value: number) => void;
};

export default function ColorLutTab({
  lutIntensity,
  onLutIntensityChange,
}: ColorLutTabProps) {
  return (
    <>
      <SettingGroup
        title="Color Correction"
        icon={<Layers3 size={16} />}
      >
        <RangeControl
          label="LUT Intensity"
          value={`${lutIntensity} %`}
          min={0}
          max={100}
          currentValue={lutIntensity}
          onChange={onLutIntensityChange}
        />
      </SettingGroup>

      <SettingGroup
        title="Creative LUT"
        icon={<Layers3 size={16} />}
      >
        <label className="text-xs text-zinc-300">
          Select LUT
        </label>

        <select className="mt-2 w-full rounded bg-[#090a0f] px-2 py-2 text-xs outline-none">
          <option>None</option>
          <option>Cinematic Warm</option>
          <option>Teal and Orange</option>
          <option>Film Matte</option>
          <option>Vintage</option>
        </select>
      </SettingGroup>
    </>
  );
}