import type {
  HTMLAttributes,
  ReactNode,
} from "react";

type TimelineRowProps = HTMLAttributes<HTMLDivElement> & {
  children?: ReactNode;
};

export default function TimelineRow({
  children,
  className = "",
  ...props
}: TimelineRowProps) {
  return (
    <div
      {...props}
      className={`relative h-14 border-b border-white/5 ${className}`}
    >
      {children}
    </div>
  );
}