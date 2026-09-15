"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";

type Props = {
  id?: string;
  value: string;
  onValueChange: (value: string) => void;
  required?: boolean;
  className?: string;
  label: string;
};

// Keep the API's local datetime format while using compact native pickers.
export function DateTimeFields({ id, value, onValueChange, required, className, label }: Props) {
  const [parts, setParts] = useState(() => value.split("T"));
  useEffect(() => { setParts(value.split("T")); }, [value]);
  const [date = "", time = ""] = parts;
  const update = (nextDate: string, nextTime: string) => {
    setParts([nextDate, nextTime]);
    onValueChange(nextDate && nextTime ? `${nextDate}T${nextTime}` : "");
  };
  const complete = Boolean(required || date || time);
  return (
    <div className="grid min-w-0 grid-cols-1 gap-2 min-[480px]:grid-cols-2">
      <Input id={id} type="date" aria-label={`${label}: fecha`} value={date}
        required={complete} onChange={e => update(e.target.value, time)} className={className} />
      <Input id={id ? `${id}-time` : undefined} type="time" aria-label={`${label}: hora`} value={time}
        required={complete} onChange={e => update(date, e.target.value)} className={className} />
    </div>
  );
}
