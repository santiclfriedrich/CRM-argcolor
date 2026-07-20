import { forwardRef, type TextareaHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        "w-full rounded-lg border border-line bg-surface px-3.5 py-2.5 text-sm text-ink transition-colors",
        "placeholder:text-ink-3",
        "focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30",
        className
      )}
      {...props}
    />
  )
);
Textarea.displayName = "Textarea";
