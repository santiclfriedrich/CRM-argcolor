import { forwardRef, type TextareaHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        "w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 transition-colors",
        "dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100",
        "placeholder:text-slate-400 dark:placeholder:text-slate-500",
        "hover:border-slate-400 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30 dark:hover:border-slate-600",
        className
      )}
      {...props}
    />
  )
);
Textarea.displayName = "Textarea";
