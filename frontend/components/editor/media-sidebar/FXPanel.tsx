"use client";

import { CheckCircle2, Search, Sparkles } from "lucide-react";
import { useFxPanel } from "@/composables/useFxPanel";

export type FXPreset = {
  id: string;
  name: string;
  filter: string;
};

type FXPanelProps = {
  selectedEffectId?: string | null;
  onSelectEffect?: (effect: FXPreset) => void;
};

export default function FXPanel({
  selectedEffectId,
  onSelectEffect,
}: FXPanelProps) {
  const {
    search,
    setSearch,
    effects,
    loading,
    error,
  } = useFxPanel();

  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <div className="px-2 py-3">
        <div className="flex items-center gap-2 rounded border border-white/10 bg-[#090a0f] px-3 py-2">
          <Search
            size={15}
            className="text-zinc-500"
            aria-hidden="true"
          />

          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label="Search effects"
            placeholder="Search effects..."
            className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-zinc-500"
          />
        </div>
      </div>

      <p className="px-2 pb-3 text-sm font-semibold text-purple-200">
        Video Effects ({effects.length})
      </p>

      {!onSelectEffect && (
        <p className="px-2 pb-3 text-xs text-zinc-400">
          Select an image or video clip to apply an effect.
        </p>
      )}

      {loading ? (
        <p
          role="status"
          className="px-2 py-12 text-center text-sm text-zinc-400"
        >
          Loading effects...
        </p>
      ) : error ? (
        <p
          role="alert"
          className="px-2 py-6 text-center text-sm text-red-400"
        >
          {error}
        </p>
      ) : (
        <div className="media-scrollbar grid flex-1 auto-rows-min grid-cols-3 gap-3 overflow-y-auto px-2 pb-4">
          {effects.map((effect) => {
            const selected = selectedEffectId === effect.id;

            return (
              <button
                key={effect.id}
                type="button"
                disabled={!onSelectEffect}
                aria-pressed={selected}
                onClick={() => onSelectEffect?.(effect)}
                className={`group min-w-0 rounded-md p-1 text-center transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400 disabled:cursor-default ${
                  selected
                    ? "bg-purple-500/15 ring-1 ring-purple-400"
                    : "enabled:hover:bg-white/5"
                }`}
              >
                <div className="relative aspect-square overflow-hidden rounded border border-white/10 bg-[#171820]">
                  <div
                    style={{ filter: effect.filter }}
                    className="absolute -inset-2 overflow-hidden bg-gradient-to-b from-indigo-500 via-fuchsia-300 to-orange-200"
                  >
                    <div className="absolute right-5 top-5 h-8 w-8 rounded-full bg-yellow-100" />
                    <div className="absolute -bottom-8 -left-6 h-24 w-28 rotate-45 bg-indigo-950" />
                    <div className="absolute -bottom-10 -right-6 h-28 w-28 rotate-45 bg-purple-900" />
                  </div>

                  <Sparkles
                    size={14}
                    aria-hidden="true"
                    className="absolute left-1 top-1 text-white"
                  />

                  {selected && (
                    <CheckCircle2
                      size={18}
                      aria-hidden="true"
                      className="absolute right-1 top-1 rounded-full bg-purple-600 text-white"
                    />
                  )}
                </div>

                <p className="mt-2 truncate text-xs text-zinc-300">
                  {effect.name}
                </p>
              </button>
            );
          })}

          {effects.length === 0 && (
            <p className="col-span-full py-12 text-center text-sm text-zinc-500">
              No matching effects
            </p>
          )}
        </div>
      )}
    </section>
  );
}