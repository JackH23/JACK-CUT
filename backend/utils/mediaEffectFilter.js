// Fixed export filters for supported FX presets.
// These approximate the browser CSS previews.
const EFFECT_FILTERS = {
  none: [],

  blur: [
    "gblur=sigma=3",
  ],

  "soft-focus": [
    "gblur=sigma=1",
    "eq=brightness=0.04",
  ],

  "color-flash": [
    "eq=saturation=1.8:contrast=1.15",
  ],

  dream: [
    "gblur=sigma=1",
    "hue=h=25:s=1.4",
  ],

  monochrome: [
    "hue=s=0",
  ],

  vintage: [
    "colorchannelmixer=rr=0.60545:rg=0.49985:rb=0.12285:gr=0.22685:gg=0.7959:gb=0.1092:br=0.1768:bg=0.3471:bb=0.43515",
    "eq=contrast=0.9",
  ],

  cinematic: [
    "eq=contrast=1.25:saturation=0.75",
  ],
};

function getMediaEffectFilters(preset = "none") {
  const value = preset ?? "none";

  if (!Object.prototype.hasOwnProperty.call(EFFECT_FILTERS, value)) {
    throw new Error(`Unsupported media effect preset: ${value}`);
  }

  // Return a copy so callers cannot change the preset definition.
  return [...EFFECT_FILTERS[value]];
}

module.exports = {
  getMediaEffectFilters,
};