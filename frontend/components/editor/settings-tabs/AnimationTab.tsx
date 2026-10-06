"use client";
import { Gauge, Sparkles } from 'lucide-react';
import type { TimelineItem } from '@/types/timeline';
import { getMediaAnimationSettings, type MediaAnimationSettings } from '@/lib/mediaAnimation';
import { animationIcons } from '@/lib/animationIcons';
import { useAnimationOptions } from '@/composables/useAnimationOptions';
import SelectableCard from '@/components/shared/SelectableCard';
import LoadingState from '@/components/shared/LoadingState';
import SettingGroup from '../SettingGroup';
export default function AnimationTab({ item, onAnimationChange }: {
    item: TimelineItem;
    onAnimationChange: (settings: MediaAnimationSettings) => void;
}) {
    const { animationOptions, loading, error } = useAnimationOptions();
    const settings = getMediaAnimationSettings(item);
    return <>{(['In', 'Out'] as const).map(phase => {
            const allowed = phase === 'In' ? ['none', 'fade-in', 'zoom-in', 'slide-left', 'slide-right'] : ['none', 'fade-out', 'zoom-out', 'slide-left', 'slide-right'];
            const presetKey = `animation${phase}Preset` as const, durationKey = `animation${phase}Duration` as const, amountKey = `animation${phase}Amount` as const;
            return <SettingGroup key={phase} title={`Animation ${phase}`} icon={<Gauge size={16}/>} enabled={settings[presetKey] !== "none"} onEnabledChange={enabled => onAnimationChange({[presetKey]: enabled ? (phase === "In" ? "fade-in" : "fade-out") : "none"})}>{loading ? <LoadingState message="Loading animations..."/> : error ? <p className="text-xs text-red-400">{error}</p> : <div className="grid grid-cols-2 gap-2">{animationOptions.filter(p => allowed.includes(p.value)).map(p => {
                        const Icon = animationIcons[p.icon as keyof typeof animationIcons] ?? Sparkles;
                        return <SelectableCard key={p.id} isSelected={settings[presetKey] === p.value} onClick={() => onAnimationChange({ [presetKey]: p.value })} ariaLabel={`Select ${p.name} Animation ${phase}`}><Icon size={20}/><span className="mt-2 text-xs">{p.name}</span></SelectableCard>;
                    })}</div>}
      <label className="mt-3 flex items-center justify-between text-xs">Duration (seconds)<input aria-label={`Animation ${phase} duration`} type="number" min={0} max={item.duration} step={0.05} value={settings[durationKey]} onChange={e => { const value = Number(e.target.value); if (Number.isFinite(value))
                onAnimationChange({ [durationKey]: Math.max(0, Math.min(item.duration, value)) }); }} className="w-20 rounded bg-zinc-800 p-1"/></label>
      <input aria-label={`Animation ${phase} duration slider`} type="range" min={0} max={item.duration} step={0.05} value={settings[durationKey]} onChange={e => onAnimationChange({ [durationKey]: Number(e.target.value) })} className="mt-2 w-full accent-purple-300"/>
      <label className="mt-3 flex justify-between text-xs">Amount<span>{settings[amountKey]} %</span></label>
      <input aria-label={`Animation ${phase} amount`} type="range" min={0} max={100} value={settings[amountKey]} onChange={e => onAnimationChange({ [amountKey]: Number(e.target.value) })} className="mt-2 w-full accent-purple-300"/>
    </SettingGroup>;
        })}</>;
}
