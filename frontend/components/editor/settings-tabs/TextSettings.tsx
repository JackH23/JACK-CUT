"use client";

import type { TextTimelineItem } from "@/types/timeline";
import RangeControl from "../RangeControl";
import SelectableCard from "@/components/shared/SelectableCard";

const fontFamilies = [
  "Arial",
  "Helvetica",
  "Georgia",
  "Times New Roman",
  "Verdana",
  "Trebuchet MS",
  "Courier New",
  "Impact",
];

type TextSettingsProps = {
  item: TextTimelineItem;
  onFontSizeChange: (fontSize: number) => void;
  onFontWeightChange: (fontWeight: number) => void;
  onFontFamilyChange: (fontFamily: string) => void;
  onTextColorChange: (textColor: string) => void;
};

export default function TextSettings({
  item,
  onFontSizeChange,
  onFontWeightChange,
  onFontFamilyChange,
  onTextColorChange,
}: TextSettingsProps) {
  const textStyle = item.textStyle ?? "subtitle";

  const defaultFontSize = {
    heading: 48,
    title: 36,
    subtitle: 30,
    caption: 20,
  }[textStyle];

  const defaultFontWeight = {
    heading: 700,
    title: 700,
    subtitle: 600,
    caption: 500,
  }[textStyle];

  const fontSize =
    item.fontSize ?? defaultFontSize;

  const fontWeight =
    item.fontWeight ?? defaultFontWeight;

  const selectedFontFamily =
    item.fontFamily ?? "Arial";

  return (
    <section
      aria-label="Text style"
      className="border-b border-white/10 p-3"
    >
      <h2 className="mb-3 text-sm font-semibold">
        Text style
      </h2>

      <RangeControl
        label="Font size"
        value={String(fontSize)}
        min={8}
        max={200}
        currentValue={fontSize}
        onChange={onFontSizeChange}
      />

      <RangeControl
        label="Font weight"
        value={String(fontWeight)}
        min={100}
        max={900}
        step={100}
        currentValue={fontWeight}
        onChange={onFontWeightChange}
      />

      {/* Font family */}
      <div className="mt-4">
        <p className="mb-2 text-xs text-zinc-300">
          Font family
        </p>

        <div className="grid grid-cols-2 gap-2">
          {fontFamilies.map((fontFamily) => {
            const isSelected =
              selectedFontFamily === fontFamily;

            return (
              <SelectableCard
                key={fontFamily}
                isSelected={isSelected}
                onClick={() =>
                  onFontFamilyChange(fontFamily)
                }
              >
                <span
                  style={{ fontFamily }}
                  className="text-lg text-white"
                >
                  Aa
                </span>

                <span className="mt-1 text-[10px]">
                  {fontFamily}
                </span>
              </SelectableCard>
            );
          })}
        </div>
      </div>

      {/* Text color */}
      <label className="mt-4 flex items-center justify-between text-xs text-zinc-300">
        Text color

        <input
          type="color"
          value={item.textColor ?? "#ffffff"}
          onChange={(event) =>
            onTextColorChange(event.target.value)
          }
          className="
            h-8
            w-12
            cursor-pointer
            rounded
            border
            border-white/10
            bg-[#090a0f]
          "
        />
      </label>
    </section>
  );
}