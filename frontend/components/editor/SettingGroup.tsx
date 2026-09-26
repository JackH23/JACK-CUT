"use client";

import type { ReactNode } from "react";

type SettingGroupProps = {
  title: string;
  icon: ReactNode;
  value?: string;
  children: ReactNode;
  enabled?: boolean;
  onEnabledChange?: (enabled: boolean) => void;
};

export default function SettingGroup({
  title,
  icon,
  value,
  children,
  enabled = true,
  onEnabledChange,
}: SettingGroupProps) {
  return (
    <section className="border-b border-white/10 p-3">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <span className="text-purple-300">{icon}</span>

        <span>{title}</span>

        {value && (
          <span className="ml-auto text-xs text-sky-400">
            {value}
          </span>
        )}

        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) =>
            onEnabledChange?.(event.target.checked)
          }
          aria-label={`Enable ${title}`}
          className={value ? "ml-2 accent-purple-400" : "ml-auto accent-purple-400"}
        />
      </div>

      {children}
    </section>
  );
}