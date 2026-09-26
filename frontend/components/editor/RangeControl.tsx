"use client";

import type { ReactNode } from "react";

type RangeControlProps = {
  label: string;
  value?: string;
  min: number;
  max: number;
  step?: number;
  currentValue: number;
  onChange: (value: number) => void;
  icon?: ReactNode;
  disabled?: boolean;
};

export default function RangeControl({
  label,
  value,
  min,
  max,
  step = 1,
  currentValue,
  onChange,
  icon,
  disabled = false,
}: RangeControlProps) {
  return (
    <div className="mt-3">
      <div className="flex justify-between text-xs">
        <span className="text-zinc-300">{label}</span>

        {value && (
          <span className="flex items-center gap-1 font-mono text-purple-200">
            {value}
            {icon}
          </span>
        )}
      </div>

      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={currentValue}
        disabled={disabled}
        onChange={(event) =>
          onChange(Number(event.target.value))
        }
        className="mt-2 h-1 w-full accent-purple-300 disabled:cursor-not-allowed disabled:opacity-50"
      />
    </div>
  );
}