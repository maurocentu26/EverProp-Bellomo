"use client";

import { useMemo } from "react";
import { Calendar, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { toArgentinaDateTimeInputValue } from "@/lib/lead-follow-up";

interface QuickScheduleButtonsProps {
  value?: string;
  onChange: (value: string) => void;
  defaultHour?: number;
  className?: string;
  label?: string;
}

interface QuickOption {
  key: string;
  label: string;
  days: number;
}

const QUICK_OPTIONS: QuickOption[] = [
  { key: "1d", label: "1 día", days: 1 },
  { key: "2d", label: "2 días", days: 2 },
  { key: "3d", label: "3 días", days: 3 },
  { key: "1w", label: "Semana que viene", days: 7 },
];

export function QuickScheduleButtons({
  value,
  onChange,
  defaultHour = 10,
  className,
  label = "Agendación rápida:",
}: QuickScheduleButtonsProps) {
  // Extract existing hour/minute from value if present, else use defaultHour
  const parsedTime = useMemo(() => {
    if (!value || !value.includes("T")) {
      return { hour: defaultHour, minute: 0 };
    }
    const timePart = value.split("T")[1];
    const [h, m] = timePart.split(":").map(Number);
    return {
      hour: Number.isFinite(h) ? h : defaultHour,
      minute: Number.isFinite(m) ? m : 0,
    };
  }, [value, defaultHour]);

  const optionsWithDay = useMemo(() => {
    return QUICK_OPTIONS.map((opt) => {
      const target = new Date();
      target.setDate(target.getDate() + opt.days);
      const dayName = new Intl.DateTimeFormat("es-AR", { weekday: "short" }).format(target);
      const capDay = dayName.charAt(0).toUpperCase() + dayName.slice(1).replace(".", "");

      target.setHours(parsedTime.hour, parsedTime.minute, 0, 0);
      const formattedValue = toArgentinaDateTimeInputValue(target);
      const targetDatePart = formattedValue.slice(0, 10);

      return {
        ...opt,
        weekday: capDay,
        formattedValue,
        targetDatePart,
      };
    });
  }, [parsedTime]);

  const handleSelect = (formattedValue: string) => {
    onChange(formattedValue);
  };

  return (
    <div className={cn("space-y-1.5", className)}>
      {label && (
        <div className="flex items-center gap-1 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
          <Clock className="size-3 text-slate-400 shrink-0" />
          <span>{label}</span>
        </div>
      )}
      <div className="flex flex-wrap gap-1.5">
        {optionsWithDay.map((opt) => {
          const isActive = Boolean(value && value.slice(0, 10) === opt.targetDatePart);

          return (
            <button
              key={opt.key}
              type="button"
              onClick={() => handleSelect(opt.formattedValue)}
              title={"Fijar para el " + opt.weekday + " (" + (opt.days === 7 ? "+7 días" : "+" + opt.days + " día" + (opt.days > 1 ? "s" : "")) + ")"}
              className={cn(
                "inline-flex h-7 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
                isActive
                  ? "border-blue-600 bg-blue-50 text-blue-700 dark:border-blue-500 dark:bg-blue-950/60 dark:text-blue-300 shadow-2xs font-bold"
                  : "border-slate-200 bg-slate-50/80 text-slate-700 hover:border-slate-300 hover:bg-white hover:text-slate-900 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300 dark:hover:border-slate-700 dark:hover:bg-slate-800"
              )}
            >
              <Calendar className={cn("size-3 shrink-0", isActive ? "text-blue-600 dark:text-blue-400" : "text-slate-400")} />
              <span>{opt.label}</span>
              <span className={cn("text-[10px] font-normal", isActive ? "text-blue-600/80 dark:text-blue-300/80" : "text-slate-400 dark:text-slate-500")}>
                {opt.weekday}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
