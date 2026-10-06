"use client";

import { Layers3, Link, RotateCcw } from "lucide-react";

type TransformSectionProps = {
  positionX?: number;
  positionY?: number;
  scale: number;
  rotation?: number;
  onScaleChange: (value: number) => void;
  onFlipHorizontal?: () => void;
  onFlipVertical?: () => void;
  onReset?: () => void;
};

export default function TransformSection({
  positionX = 0,
  positionY = 0,
  scale,
  rotation = 0,
  onScaleChange,
  onFlipHorizontal,
  onFlipVertical,
  onReset,
}: TransformSectionProps) {
  return (
    <section className="border-b border-white/10 p-3">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <Layers3 size={16} className="text-purple-300" />

        <span>Transform</span>

        <button
          type="button"
          aria-label="Reset transform"
          onClick={onReset}
          className="ml-auto rounded p-1 text-zinc-400 hover:bg-white/10 hover:text-purple-300"
        >
          <RotateCcw size={14} />
        </button>

        <input
          type="checkbox"
          defaultChecked
          aria-label="Enable Transform"
          className="accent-purple-400"
        />
      </div>

      <label className="text-xs text-zinc-300">
        Position Coordinates
      </label>

      <div className="mt-2 grid grid-cols-2 gap-1">
        <NumberValue label="X" value={`${positionX.toFixed(1)} px`} />
        <NumberValue label="Y" value={`${positionY.toFixed(1)} px`} />
      </div>

      <div className="mt-3">
        <div className="flex justify-between text-xs">
          <span className="text-zinc-300">Scale Uniform</span>

          <span className="flex items-center gap-1 font-mono text-purple-200">
            {scale} %
            <Link size={14} />
          </span>
        </div>

        <input
          type="range"
          aria-label="Media scale"
          step={0.01}
          min={10}
          max={200}
          value={scale}
          onChange={(event) =>
            onScaleChange(Number(event.target.value))
          }
          className="mt-2 h-1 w-full accent-purple-300"
        />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-1">
        <div>
          <label className="text-xs text-zinc-300">Rotation</label>

          <button
            type="button"
            onClick={onReset}
            className="mt-1 flex w-full items-center justify-between rounded bg-[#090a0f] px-2 py-2 text-xs"
          >
            <RotateCcw size={14} />

            <span className="font-mono text-purple-200">
              {rotation.toFixed(1)}°
            </span>
          </button>
        </div>

        <div>
          <label className="text-xs text-zinc-300">
            Flip Alignment
          </label>

          <div className="mt-1 flex justify-around rounded bg-[#090a0f] p-2 text-purple-300">
            <button
              type="button"
              aria-label="Flip horizontally"
              onClick={onFlipHorizontal}
            >
              ↔
            </button>

            <button
              type="button"
              aria-label="Flip vertically"
              onClick={onFlipVertical}
            >
              ↕
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

function NumberValue({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between rounded bg-[#090a0f] px-2 py-2 text-xs">
      <span>{label}</span>
      <span className="font-mono text-purple-200">{value}</span>
    </div>
  );
}