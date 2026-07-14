import { forwardRef, type InputHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "h-11 w-full rounded-lg border border-slate-300 bg-white px-3.5 text-sm text-slate-900 transition-colors",
        "dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100",
        "placeholder:text-slate-400 dark:placeholder:text-slate-500",
        "hover:border-slate-400 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30 dark:hover:border-slate-600",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
);
Input.displayName = "Input";
