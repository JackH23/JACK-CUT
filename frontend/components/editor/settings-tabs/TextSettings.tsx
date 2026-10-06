"use client";

import type { TextTimelineItem } from "@/types/timeline";

import { useTextSettings } from "@/composables/useTextSettings";
import LoadingState from "@/components/shared/LoadingState";
import Pagination from "@/components/shared/Pagination";
import SelectableCard from "@/components/shared/SelectableCard";

import RangeControl from "../RangeControl";

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
  const {
    fontSize,
    fontWeight,
    textColor,

    fonts,
    page,
    totalPages,
    loading,
    error,

    isFontSelected,
    handleFontSelect,

    nextPage,
    previousPage,
  } = useTextSettings({
    item,
    onFontFamilyChange,
  });

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

        {loading ? (
          <LoadingState message="Loading fonts..." />
        ) : error ? (
          <p className="text-xs text-red-400">
            {error}
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2">
              {fonts.map((font) => (
                <SelectableCard
                  key={font.id}
                  isSelected={isFontSelected(
                    font.font_family,
                  )}
                  onClick={() =>
                    handleFontSelect(
                      font.font_family,
                    )
                  }
                >
                  <span
                    style={{
                      fontFamily:
                        font.font_family,
                    }}
                    className="text-lg text-white"
                  >
                    Aa
                  </span>

                  <span className="mt-1 text-[10px]">
                    {font.name}
                  </span>
                </SelectableCard>
              ))}
            </div>

            <Pagination
              page={page}
              totalPages={totalPages}
              onPrevious={previousPage}
              onNext={nextPage}
              className="mt-3"
            />
          </>
        )}
      </div>

      {/* Text color */}
      <label className="mt-4 flex items-center justify-between text-xs text-zinc-300">
        Text color

        <input
          type="color"
          value={textColor}
          onChange={(event) =>
            onTextColorChange(
              event.target.value,
            )
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