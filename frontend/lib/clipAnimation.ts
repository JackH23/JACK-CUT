import type { CSSProperties } from 'react';
import { getMediaAnimationState, type MediaAnimationInput } from './mediaAnimation';
export function getClipAnimationStyle(input: MediaAnimationInput & {
    preset?: string;
    amount?: number;
    playheadTime: number;
    startTime: number;
}): CSSProperties {
    const { opacity, scale, offset } = getMediaAnimationState({ ...input, animationPreset: input.animationPreset ?? input.preset, animationAmount: input.animationAmount ?? input.amount }, input.playheadTime - input.startTime);
    return { opacity, transform: `translateX(${offset}%) scale(${scale})` };
}
