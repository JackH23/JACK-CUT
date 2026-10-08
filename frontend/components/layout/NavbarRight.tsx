import {
  ChevronDown,
  Eye,
  Keyboard,
  Settings,
  Share2,
} from "lucide-react";
import type { User } from "@/services/authService";
import LoadingState from "@/components/shared/LoadingState";

type NavbarRightProps = {
  user: User | null;
  onExport: () => void;
  exporting: boolean;
  onOpenProfile: () => void;
};

export default function NavbarRight({
  user,
  onExport,
  exporting,
  onOpenProfile,
}: NavbarRightProps) {
  return (
    <div className="flex shrink-0 items-center gap-2">
      <button
        type="button"
        className="hidden items-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-medium text-zinc-200 md:flex"
      >
        <Eye size={17} className="text-zinc-400" />
        <span>1080p Full</span>
        <ChevronDown size={15} />
      </button>

      <button
        type="button"
        onClick={onExport}
        disabled={exporting}
        aria-label={exporting ? "Exporting video" : "Export video"}
        aria-busy={exporting}
        className="flex items-center gap-2 rounded-md bg-gradient-to-r from-purple-700 to-fuchsia-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-purple-950/40 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70"
      >
        {exporting ? (
          <LoadingState
            message="Exporting..."
            size="sm"
            className="!py-0 [&_span]:!text-white [&_svg]:!text-white"
          />
        ) : (
          <>
            <Share2 size={17} />
            <span className="hidden sm:inline">Export Video</span>
          </>
        )}
      </button>

      <div className="hidden h-6 w-px bg-white/10 md:block" />

      <button
        type="button"
        aria-label="Settings"
        className="hidden rounded-md p-2 text-zinc-400 transition hover:bg-white/10 hover:text-white md:block"
      >
        <Settings size={19} />
      </button>

      <button
        type="button"
        aria-label="Keyboard shortcuts"
        className="hidden rounded-md p-2 text-zinc-400 transition hover:bg-white/10 hover:text-white lg:block"
      >
        <Keyboard size={19} />
      </button>

      <div className="ml-1 flex min-w-0 items-center gap-2">
        {user && (
          <div className="hidden max-w-36 min-w-0 text-right text-xs lg:block">
            <p className="truncate font-semibold">{user.name}</p>
            <p className="truncate text-zinc-400">{user.email}</p>
          </div>
        )}

        <button
          type="button"
          onClick={onOpenProfile}
          aria-label="Open user profile"
          className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-zinc-700 bg-gradient-to-br from-orange-400 to-purple-600"
        >
          <span className="text-sm font-bold">
            {user?.name?.charAt(0).toUpperCase() || "?"}
          </span>

          {user && (
            <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-[#090a0f] bg-sky-400" />
          )}
        </button>
      </div>
    </div>
  );
}