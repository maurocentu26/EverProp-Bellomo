"use client";

import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";

export function SettingsConfirmation({ open, title, before, after, busy, onCancel, onConfirm }: {
  open: boolean; title: string; before: string; after: string; busy: boolean; onCancel: () => void; onConfirm: () => void;
}) {
  return <Dialog open={open} onOpenChange={value => { if (!value && !busy) onCancel(); }}>
    <DialogContent showCloseButton={false} className="settings-view settings-dialog admin-workspace">
      <DialogTitle>{title}</DialogTitle>
      <DialogDescription>Este cambio afecta a la inmobiliaria y a su equipo. Revisá los valores antes de confirmar.</DialogDescription>
      <dl><dt>Valor anterior</dt><dd>{before}</dd><dt>Valor nuevo</dt><dd>{after}</dd></dl>
      <div className="settings-actions"><button disabled={busy} onClick={onCancel}>Cancelar</button><button disabled={busy} onClick={onConfirm}>{busy ? "Guardando…" : "Confirmar"}</button></div>
    </DialogContent>
  </Dialog>;
}
