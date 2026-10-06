import type { Guides } from "@/lib/previewSnapping";
import layout from "@/lib/textLayout.json";

// Mounted directly in the untransformed video canvas, separately from selection.
export default function PreviewSnapGuides({ vertical, horizontal }: Guides) {
  if (!vertical.length && !horizontal.length) return null;
  return (
    <div data-preview-snap-guides className="pointer-events-none absolute inset-0 z-40 overflow-hidden" aria-hidden="true">
      {vertical.map(x => (
        <div key={x} data-snap-x={x} className="absolute inset-y-0 w-[2px] drop-shadow-[0_0_1px_#000]" style={{
          left: `${x / layout.referenceWidth * 100}%`,
          transform: x === layout.referenceWidth ? "translateX(-2px)" : undefined,
          backgroundImage: "repeating-linear-gradient(to bottom, #e879f9 0px, #e879f9 5px, transparent 5px, transparent 9px)",
        }} />
      ))}
      {horizontal.map(y => (
        <div key={y} data-snap-y={y} className="absolute inset-x-0 h-[2px] drop-shadow-[0_0_1px_#000]" style={{
          top: `${y / layout.referenceHeight * 100}%`,
          transform: y === layout.referenceHeight ? "translateY(-2px)" : undefined,
          backgroundImage: "repeating-linear-gradient(to right, #e879f9 0px, #e879f9 5px, transparent 5px, transparent 9px)",
        }} />
      ))}
    </div>
  );
}
