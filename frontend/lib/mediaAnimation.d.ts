export type MediaAnimationSettings = {
    animationInPreset?: string | null;
    animationInDuration?: number | null;
    animationInAmount?: number | null;
    animationOutPreset?: string | null;
    animationOutDuration?: number | null;
    animationOutAmount?: number | null;
};
export type MediaAnimationInput = MediaAnimationSettings & {
    duration: number;
    animationPreset?: string;
    animationAmount?: number;
};
export const animationFields: (keyof MediaAnimationSettings)[];
export function getMediaAnimationSettings(clip: MediaAnimationInput): {
    [K in keyof Required<MediaAnimationSettings>]: NonNullable<MediaAnimationSettings[K]>;
} & {
    legacy: boolean;
};
export function getMediaAnimationState(clip: MediaAnimationInput, time: number): {
    opacity: number;
    scale: number;
    offset: number;
};
export function getMediaAnimationExpressions(clip: MediaAnimationInput): {
    opacity: string | number;
    scale: string | number;
    offset: string | number;
};
