import * as React from "react";
import { cn } from "@/lib/utils";

type Props = {
  variant?: "default" | "positive" | "negative";
  className?: string;
  children?: React.ReactNode;
};

export default function Badge({ variant = "default", className, children }: Props) {
  const base = "inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium";
  const variantClass =
    variant === "positive"
      ? "bg-emerald-50 text-emerald-800"
      : variant === "negative"
      ? "bg-rose-50 text-rose-800"
      : "bg-slate-100 text-slate-800";

  return <span className={cn(base, variantClass, className)}>{children}</span>;
}
