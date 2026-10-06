import {
  Ban,
  MoveLeft,
  MoveRight,
  Search,
  SearchX,
  Sparkles,
} from "lucide-react";

export const animationIcons = {
  ban: Ban,
  sparkles: Sparkles,
  search: Search,
  "search-x": SearchX,
  "move-left": MoveLeft,
  "move-right": MoveRight,
} as const;

export type AnimationIconName =
  keyof typeof animationIcons;

export function getAnimationIcon(
  icon: string,
) {
  return (
    animationIcons[
      icon as AnimationIconName
    ] ?? Sparkles
  );
}