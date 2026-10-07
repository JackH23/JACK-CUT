import type { CSSProperties } from 'react';
import type { MediaAnimationInput } from './mediaAnimation';
export function getTextAnimationState(clip: MediaAnimationInput, localTime: number): { opacity: number; scale: number; offset: number };
export function getTextAnimationStyle(clip: MediaAnimationInput, localTime: number): CSSProperties;
