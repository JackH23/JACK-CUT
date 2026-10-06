import type { ReactNode } from "react";

type SelectableCardProps = {
  children: ReactNode;
  isSelected?: boolean;
  onClick?: () => void;
  className?: string;
  ariaLabel?: string;
};

export default function SelectableCard({
  children,
  isSelected = false,
  onClick,
  className = "",
  ariaLabel,
}: SelectableCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      aria-pressed={isSelected}
      className={`
        flex
        min-h-16
        flex-col
        items-center
        justify-center
        rounded-md
        border
        px-2
        py-3
        transition
        ${
          isSelected
            ? "border-purple-400 bg-purple-500/10 text-purple-300"
            : "border-white/10 bg-[#090a0f] text-zinc-300 hover:border-white/30 hover:bg-white/5"
        }
        ${className}
      `}
    >
      {children}
    </button>
  );
}