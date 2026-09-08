"use client";
import { useRef, useState } from "react";
import { toast } from "sonner";

export function useCollectionAction() {
  const lock = useRef(false);
  const [saving, setSaving] = useState(false);
  async function run(action: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setSaving(true);
    try { await action(); }
    catch (error) { toast.error(error instanceof Error ? error.message : "No se pudo guardar. Reintentá la operación."); }
    finally { lock.current = false; setSaving(false); }
  }
  return { run, saving };
}
