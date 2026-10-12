const EFFECT_FILTERS: Record<string, string> = {
  none: "none",
  blur: "blur(3px)",
  "soft-focus": "blur(1px) brightness(1.1)",
  "color-flash": "saturate(1.8) contrast(1.15)",
  dream: "blur(1px) saturate(1.4) hue-rotate(25deg)",
  monochrome: "grayscale(1)",
  vintage: "sepia(0.65) contrast(0.9)",
  cinematic: "contrast(1.25) saturate(0.75)",
};

export function getMediaEffectFilter(
  preset?: string | null,
): string {
  return EFFECT_FILTERS[preset ?? "none"] ?? "none";
}