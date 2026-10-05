"use client";

import {
  AudioLines,
  ImageIcon,
  Sparkles,
  Type,
} from "lucide-react";

import type { SidebarTab } from "../MediaSidebar";

type MediaTypeTabsProps = {
  activeTab: SidebarTab;
  onTabChange: (tab: SidebarTab) => void;
};

const tabs: {
  id: SidebarTab;
  label: string;
  icon: typeof ImageIcon;
}[] = [
  {
    id: "media",
    label: "Media",
    icon: ImageIcon,
  },
  {
    id: "audio",
    label: "Audio",
    icon: AudioLines,
  },
  {
    id: "text",
    label: "Text",
    icon: Type,
  },
  {
    id: "fx",
    label: "FX",
    icon: Sparkles,
  },
];

export default function MediaTypeTabs({
  activeTab,
  onTabChange,
}: MediaTypeTabsProps) {
  return (
    <div className="flex h-12 items-center gap-1 border-b border-white/10 px-2">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;

        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onTabChange(tab.id)}
            className={`flex items-center gap-1.5 rounded px-2.5 py-2 text-sm font-semibold transition ${
              isActive
                ? "bg-purple-300 text-purple-950"
                : "text-white hover:bg-white/10"
            }`}
          >
            <Icon
              size={16}
              className={
                isActive
                  ? "text-purple-950"
                  : "text-purple-300"
              }
            />

            {tab.label}
          </button>
        );
      })}
    </div>
  );
}