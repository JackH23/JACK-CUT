import type {
  CSSProperties,
} from "react";

type ClipAnimationInput = {
  preset?: string;
  amount?: number;

  playheadTime: number;
  startTime: number;
  duration: number;
};

const TRANSITION_DURATION = 1;

const clamp = (
  value: number,
  min = 0,
  max = 1,
) => {
  return Math.min(
    Math.max(value, min),
    max,
  );
};

export function getClipAnimationStyle({
  preset = "none",
  amount = 50,
  playheadTime,
  startTime,
  duration,
}: ClipAnimationInput): CSSProperties {
  if (
    preset === "none" ||
    duration <= 0
  ) {
    return {};
  }

  const strength =
    clamp(amount / 100);

  const localTime =
    clamp(
      playheadTime - startTime,
      0,
      duration,
    );

  const transitionDuration =
    Math.min(
      TRANSITION_DURATION,
      duration,
    );

  const inProgress =
    clamp(
      localTime /
        transitionDuration,
    );

  const outProgress =
    clamp(
      (duration - localTime) /
        transitionDuration,
    );

  switch (preset) {
    case "fade-in":
      return {
        opacity:
          1 -
          strength *
            (1 - inProgress),
      };

    case "fade-out":
      return {
        opacity:
          1 -
          strength *
            (1 - outProgress),
      };

    case "zoom-in": {
      const startScale =
        1 - 0.25 * strength;

      const scale =
        startScale +
        (1 - startScale) *
          inProgress;

      return {
        transform: `scale(${scale})`,
      };
    }

    case "zoom-out": {
      const startScale =
        1 + 0.25 * strength;

      const scale =
        startScale -
        (startScale - 1) *
          inProgress;

      return {
        transform: `scale(${scale})`,
      };
    }

    case "slide-left": {
      const offset =
        (1 - inProgress) *
        100 *
        strength;

      return {
        transform:
          `translateX(${offset}%)`,
      };
    }

    case "slide-right": {
      const offset =
        (1 - inProgress) *
        -100 *
        strength;

      return {
        transform:
          `translateX(${offset}%)`,
      };
    }

    default:
      return {};
  }
}