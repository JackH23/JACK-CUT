import { Type } from "lucide-react";
import type { TimelineItem } from "@/types/timeline";

export default function ClipMediaPreview({ item }: { item: TimelineItem }) {
  const isText =
    item.type === "text";

  const file =
    item.type === "media"
      ? item.file
      : undefined;

  const clipName = isText
    ? item.text || "Text"
    : file?.name || "Media";

  const clipType = isText
    ? "text"
    : file?.type;

  return (
    <>
      {/* TEXT */}
      {isText && (
        <div className="pointer-events-none flex h-full items-center gap-2 px-3">
          <Type
            size={14}
            className="shrink-0 text-amber-300"
          />

          <span className="truncate text-xs font-semibold text-amber-100">
            {clipName}
          </span>
        </div>
      )}

      {/* IMAGE */}
      {clipType === "image" &&
        file && (
          <img
            src={file.url}
            alt={file.name}
            draggable={false}
            className="pointer-events-none h-full w-full select-none object-cover opacity-70"
          />
        )}

      {/* VIDEO */}
      {clipType === "video" &&
        file && (
          <video
            src={file.url}
            muted
            draggable={false}
            className="pointer-events-none h-full w-full select-none object-cover opacity-70"
          />
        )}

      {/* AUDIO */}
      {clipType === "audio" &&
        file && (
          <div className="pointer-events-none flex h-full items-center gap-0.5 overflow-hidden px-2">
            {Array.from({
              length: 32,
            }).map(
              (_, barIndex) => (
                <span
                  key={barIndex}
                  style={{
                    height: `${25 +
                      ((barIndex *
                        17) %
                        75)
                      }%`,
                  }}
                  className="w-0.5 shrink-0 rounded-full bg-cyan-400"
                />
              ),
            )}
          </div>
        )}
    </>
  );
}
