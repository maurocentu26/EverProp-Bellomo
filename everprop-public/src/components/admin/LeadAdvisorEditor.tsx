"use client";
import { useLeadAdvisors } from "@/hooks/use-lead-advisors";

import { useState } from "react";
import { UserRoundCog, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";

type LeadAdvisorEditorProps = {
  leadName: string;
  currentAgentId?: string;
  onClose: () => void;
  onSave: (agentId?: string) => void | Promise<void>;
};

export function LeadAdvisorEditor({
  leadName,
  currentAgentId,
  onClose,
  onSave,
}: LeadAdvisorEditorProps) {
  const { advisors, error } = useLeadAdvisors();
  const normalizedCurrentId = currentAgentId || "";
  const [selectedAgentId, setSelectedAgentId] = useState(normalizedCurrentId);
  const [saving, setSaving] = useState(false);
  const selectionChanged = selectedAgentId !== normalizedCurrentId;

  return (
    <Dialog open onOpenChange={(open) => !open && !saving && onClose()}>
      <DialogContent 
        showCloseButton={false} 
        className="admin-workspace w-full sm:max-w-md max-h-[calc(100dvh-2rem)] overflow-hidden p-0 rounded-2xl border border-border bg-card shadow-2xl flex flex-col"
      >
        <div className="flex min-h-0 w-full flex-col">
          {/* Header Compacto */}
          <header className="shrink-0 border-b border-border bg-card px-4 sm:px-6 py-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <span className="hidden sm:flex size-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-xs">
                <UserRoundCog className="size-5" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <DialogTitle className="text-lg font-bold text-foreground whitespace-normal">Cambiar asesor</DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground whitespace-normal break-words">
                  {leadName}
                </DialogDescription>
              </div>
            </div>
            <Button 
              type="button" 
              variant="ghost" 
              size="icon" 
              disabled={saving} onClick={onClose}
              className="h-11 w-11 shrink-0 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg"
              aria-label="Cerrar modal"
            >
              <X className="size-5" aria-hidden="true" />
            </Button>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 sm:px-6 py-5 space-y-4">
            <p className="text-xs text-muted-foreground leading-relaxed">
              Elegí quién gestionará este cliente. Podés seleccionar «Sin asignar» si todavía no tiene responsable.
            </p>
            {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
            <label className="block text-xs font-bold text-foreground">
              Asesor responsable
              <select
                disabled={saving}
                value={selectedAgentId}
                onChange={(event) => setSelectedAgentId(event.target.value)}
                className="mt-1.5 h-10 w-full rounded-xl border border-input bg-background px-3 text-sm text-foreground outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              >
                <option value="">Sin asignar</option>
                {currentAgentId && !advisors.some(a => a.id === currentAgentId) && <option value={currentAgentId}>Responsable actual</option>}
                {advisors.map((advisor) => (
                  <option key={advisor.id} value={advisor.id}>{advisor.name}</option>
                ))}
              </select>
            </label>
          </div>

          <footer className="shrink-0 border-t border-border bg-card px-4 py-3.5 flex flex-col-reverse sm:flex-row justify-end gap-2.5">
            <Button type="button" variant="outline" disabled={saving} onClick={onClose} className="h-10 px-4 text-xs font-semibold rounded-xl border-input hover:bg-muted">
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={async () => { if (saving) return; setSaving(true); try { await onSave(selectedAgentId || undefined); } finally { setSaving(false); } }}
              disabled={saving || !selectionChanged || Boolean(error)}
              className="h-10 bg-blue-600 px-5 text-xs font-bold text-white hover:bg-blue-700 rounded-xl shadow-sm disabled:opacity-100 disabled:bg-muted disabled:text-muted-foreground disabled:shadow-none"
            >
              {saving ? "Guardando…" : "Guardar responsable"}
            </Button>
          </footer>
        </div>
      </DialogContent>
    </Dialog>
  );
}
