import { type HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

export type Tone =
  | "default"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "neutral"
  | "accent";

// Tinte de fondo suave + texto del mismo color semántico.
const TONES: Record<Tone, string> = {
  default: "bg-surface2 text-ink-2",
  success: "bg-success/12 text-success",
  warning: "bg-warning/12 text-warning",
  danger: "bg-danger/12 text-danger",
  info: "bg-info/12 text-info",
  neutral: "bg-neutral/12 text-neutral",
  accent: "bg-accent/12 text-accent",
};

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
}

export function Badge({ className, tone = "default", ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        TONES[tone],
        className
      )}
      {...props}
    />
  );
}
