"use client";

import { Gauge, Volume2 } from "lucide-react";
import SettingGroup from "../SettingGroup";
import RangeControl from "../RangeControl";

type AudioTabProps = {
  volume: number;
  pan: number;
  onVolumeChange: (value: number) => void;
  onPanChange: (value: number) => void;
};

export default function AudioTab({
  volume,
  pan,
  onVolumeChange,
  onPanChange,
}: AudioTabProps) {
  return (
    <>
      <SettingGroup
        title="Clip Audio"
        icon={<Volume2 size={16} />}
      >
        <RangeControl
          label="Volume"
          value={`${volume} %`}
          min={0}
          max={200}
          currentValue={volume}
          onChange={onVolumeChange}
        />

        <RangeControl
          label="Pan"
          value={
            pan === 0
              ? "Center"
              : pan < 0
                ? `${Math.abs(pan)} L`
                : `${pan} R`
          }
          min={-100}
          max={100}
          currentValue={pan}
          onChange={onPanChange}
        />

        <label className="mt-4 flex items-center justify-between text-xs">
          Mute Clip
          <input
            type="checkbox"
            className="accent-purple-400"
          />
        </label>
      </SettingGroup>

      <SettingGroup
        title="Audio Enhancement"
        icon={<Gauge size={16} />}
      >
        <label className="flex items-center justify-between text-xs">
          Noise Reduction
          <input
            type="checkbox"
            className="accent-purple-400"
          />
        </label>

        <label className="mt-3 flex items-center justify-between text-xs">
          Normalize Audio
          <input
            type="checkbox"
            className="accent-purple-400"
          />
        </label>
      </SettingGroup>
    </>
  );
}