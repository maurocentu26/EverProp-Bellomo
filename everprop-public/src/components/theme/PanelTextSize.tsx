"use client";

import { createContext, useCallback, useContext, useLayoutEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { ALargeSmall, Check } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { createTextSizePreferences, TEXT_SIZE_EVENT, textSizeKey, type PanelTextSize } from "@/lib/text-size-preference";
import { cn } from "@/lib/utils";

const preferences = createTextSizePreferences(() => window.localStorage);
const TextSizeContext = createContext<{ size: PanelTextSize; choose: (size: PanelTextSize) => void; saved: boolean } | null>(null);

export function PanelTextSizeProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const [saved, setSaved] = useState(true);
  const subscribe = useCallback((notify: () => void) => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === textSizeKey(userId)) {
        preferences.clearTemporary(userId);
        notify();
      }
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener(TEXT_SIZE_EVENT, notify);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(TEXT_SIZE_EVENT, notify);
    };
  }, [userId]);
  const snapshot = useCallback(() => preferences.read(userId), [userId]);
  const size = useSyncExternalStore(subscribe, snapshot, () => "actual" as const);

  useLayoutEffect(() => {
    document.documentElement.dataset.panelTextSize = size;
    return () => { delete document.documentElement.dataset.panelTextSize; };
  }, [size]);

  const choose = (value: PanelTextSize) => {
    setSaved(preferences.write(userId, value));
    window.dispatchEvent(new Event(TEXT_SIZE_EVENT));
  };
  return <TextSizeContext.Provider value={{ size, choose, saved }}>{children}</TextSizeContext.Provider>;
}

export function PanelTextSizeControl() {
  const context = useContext(TextSizeContext);
  if (!context) throw new Error("PanelTextSizeControl requires PanelTextSizeProvider");
  const { size, choose, saved } = context;
  return (
    <Popover>
      <PopoverTrigger
        aria-label={`Tamaño de texto: ${size === "grande" ? "Grande" : "Actual"}`}
        title="Tamaño de texto"
        className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl border border-border bg-card text-card-foreground transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <ALargeSmall className="size-5" aria-hidden="true" />
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-72 max-w-[calc(100vw-2rem)] p-4">
        <fieldset>
          <legend className="text-sm font-bold">Tamaño de texto</legend>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">Elegí cómo preferís leer el panel.</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {([ ["actual", "Actual", "Tamaño habitual"], ["grande", "Grande", "20 % más grande"] ] as const).map(([value, label, hint]) => (
              <label key={value} className={cn("relative flex min-h-20 cursor-pointer flex-col justify-center rounded-xl border p-3 transition-colors", size === value ? "border-ring bg-accent text-accent-foreground" : "border-border hover:bg-muted")}>
                <input type="radio" name="panel-text-size" value={value} checked={size === value} onChange={() => choose(value)} className="peer sr-only" />
                <span className="pointer-events-none absolute inset-0 rounded-xl peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring" />
                <span className="flex items-center justify-between gap-2 text-sm font-semibold">{label}{size === value && <Check className="size-4" aria-hidden="true" />}</span>
                <span className="mt-1 text-xs">{hint}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <p role="status" className="mt-3 text-xs leading-5 text-muted-foreground">{saved ? "Se guarda para tu usuario en este navegador." : "Aplicado. El navegador no permite guardarlo; se conserva durante esta sesión."}</p>
      </PopoverContent>
    </Popover>
  );
}
