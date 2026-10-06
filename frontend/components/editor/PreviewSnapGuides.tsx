import type { Guides } from "@/lib/previewSnapping";
import layout from "@/lib/textLayout.json";

export default function PreviewSnapGuides({ vertical, horizontal }: Guides) {
  return <div data-preview-snap-guides className="pointer-events-none absolute inset-0 z-40 overflow-hidden" aria-hidden="true">
    {vertical.map(x => <div key={x} data-snap-x={x} className="absolute inset-y-0 w-px bg-fuchsia-400 shadow-[0_0_2px_#000]" style={{left:`${x/layout.referenceWidth*100}%`, transform: x === layout.referenceWidth ? "translateX(-1px)" : undefined}} />)}
    {horizontal.map(y => <div key={y} data-snap-y={y} className="absolute inset-x-0 h-px bg-fuchsia-400 shadow-[0_0_2px_#000]" style={{top:`${y/layout.referenceHeight*100}%`, transform: y === layout.referenceHeight ? "translateY(-1px)" : undefined}} />)}
  </div>;
}
