import type { TimelineItem } from "@/types/timeline";

// Percentages follow the current clip duration without changing saved settings.
function regionWidth(preset: string | null | undefined, duration: number | null | undefined, clipDuration: number) {
  if (!preset || preset === "none" || !Number.isFinite(duration) || !Number.isFinite(clipDuration) || clipDuration <= 0) return 0;
  return Math.min(1, Math.max(0, (duration ?? 0) / clipDuration)) * 100;
}

export default function TimelineAnimationRegions({ item }: { item: TimelineItem }) {
  if (item.type !== "media" || (item.file?.type !== "image" && item.file?.type !== "video")) return null;

  const regions = [
    { phase: "in", label: "IN", preset: item.animationInPreset, duration: item.animationInDuration, width: regionWidth(item.animationInPreset, item.animationInDuration, item.duration) },
    { phase: "out", label: "OUT", preset: item.animationOutPreset, duration: item.animationOutDuration, width: regionWidth(item.animationOutPreset, item.animationOutDuration, item.duration) },
  ];

  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-10">
      {regions.filter(region => region.width > 0).map(region => (
        <div
          key={region.phase}
          data-animation-region={region.phase}
          title={`Animation ${region.label}: ${Math.min(region.duration ?? 0, item.duration)}s (${region.preset})`}
          style={{ width: `${region.width}%` }}
          className={`absolute overflow-hidden [container-type:inline-size] ${region.phase === "in"
            ? "inset-y-0 left-0 border-r-2 border-purple-300/90 bg-purple-500/20"
            : "inset-y-0 right-0 border-l-2 border-pink-300/90 bg-pink-500/20"}`}
        >
          <span className={`absolute hidden rounded bg-black/60 px-1 text-[9px] font-bold leading-4 @[32px]:block ${region.phase === "in"
            ? "left-2 top-1 text-purple-200"
            : "top-1 right-2 text-pink-200"}`}>
            {region.label}
          </span>
        </div>
      ))}
    </div>
  );
}
