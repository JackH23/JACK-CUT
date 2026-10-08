
import Image from "next/image";
import { Cloud, Redo2, Undo2, Video } from "lucide-react";

export default function NavbarLeft() {
  return (
    <div className="flex min-w-0 items-center gap-3">
      {/* JackCut branding */}
      <div className="flex shrink-0 items-center gap-2">
        <Image
          src="/icon/Cinematic%20Neon%20J%20Film%20Logo.png"
          alt="JackCut Logo"
          width={44}
          height={44}
          priority
          className="h-11 w-11 rounded-xl object-cover"
        />

        <span className="text-lg font-bold tracking-tight">
          JackCut
        </span>

        <span className="rounded border border-white/10 bg-white/10 px-2 py-1 text-xs font-semibold tracking-wider text-purple-200">
          STUDIO
        </span>
      </div>

      <div className="h-6 w-px bg-white/10" />

      {/* Undo / Redo */}
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label="Undo"
          className="rounded-md p-2 text-zinc-400 transition hover:bg-white/10 hover:text-white"
        >
          <Undo2 size={18} />
        </button>

        <button
          type="button"
          aria-label="Redo"
          className="rounded-md p-2 text-zinc-400 transition hover:bg-white/10 hover:text-white"
        >
          <Redo2 size={18} />
        </button>
      </div>

      {/* Project information */}
      <button
        type="button"
        className="hidden min-w-0 items-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-sm lg:flex"
      >
        <Video
          size={16}
          className="shrink-0 text-purple-300"
        />

        <span className="max-w-56 truncate font-semibold">
          Cinematic_Vlog_Final_Cut
        </span>

        <span className="text-zinc-500">•••</span>

        <span className="flex shrink-0 items-center gap-1 text-xs text-zinc-400">
          <Cloud
            size={13}
            className="text-sky-400"
          />
          Saved to Cloud
        </span>
      </button>
    </div>
  );
}
