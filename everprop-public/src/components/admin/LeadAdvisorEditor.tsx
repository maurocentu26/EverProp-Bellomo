"use client";

import { useState } from "react";
import { UserRoundCog, X } from "lucide-react";

import { MOCK_USERS, REAL_ADVISORS } from "@/data/auth-sample";
import { isMockDataMode } from "@/lib/data-mode";
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
  onSave: (agentId?: string) => void;
};

export function LeadAdvisorEditor({
  leadName,
  currentAgentId,
  onClose,
  onSave,
}: LeadAdvisorEditorProps) {
  const advisors = isMockDataMode
    ? MOCK_USERS.filter((user) => user.role === "ADVISOR")
    : REAL_ADVISORS;
  const normalizedCurrentId =
    currentAgentId && advisors.some((advisor) => advisor.id === currentAgentId)
      ? currentAgentId
      : "";
  const [selectedAgentId, setSelectedAgentId] = useState(normalizedCurrentId);
  const selectionChanged = selectedAgentId !== normalizedCurrentId;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent 
        showCloseButton={false} 
        className="w-full sm:max-w-md max-h-[90vh] overflow-hidden p-0 rounded-2xl border border-slate-200 bg-white shadow-2xl flex flex-col"
      >
        <div className="flex min-h-0 w-full flex-col">
          {/* Header Compacto */}
          <header className="shrink-0 border-b border-slate-100 bg-white px-6 py-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-xs">
                <UserRoundCog className="size-5" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <DialogTitle className="text-lg font-bold text-slate-950 truncate">Cambiar asesor</DialogTitle>
                <DialogDescription className="text-xs text-slate-500 truncate">
                  Asignación de responsable para {leadName}
                </DialogDescription>
              </div>
            </div>
            <Button 
              type="button" 
              variant="ghost" 
              size="icon" 
              onClick={onClose} 
              className="h-9 w-9 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg"
              aria-label="Cerrar modal"
            >
              <X className="size-5" aria-hidden="true" />
            </Button>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5 space-y-4">
            <p className="text-xs text-slate-600 leading-relaxed">
              El lead conserva un solo responsable. Un administrador puede dejarlo sin asignar y completarlo más adelante.
            </p>
            <label className="block text-xs font-bold text-slate-700">
              Asesor responsable
              <select
                value={selectedAgentId}
                onChange={(event) => setSelectedAgentId(event.target.value)}
                className="mt-1.5 h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              >
                <option value="">Sin asignar</option>
                {advisors.map((advisor) => (
                  <option key={advisor.id} value={advisor.id}>{advisor.name}</option>
                ))}
              </select>
            </label>
          </div>

          <footer className="shrink-0 border-t border-slate-100 bg-slate-50/60 px-6 py-3.5 flex justify-end gap-2.5">
            <Button type="button" variant="outline" onClick={onClose} className="h-10 px-4 text-xs font-semibold rounded-xl border-slate-300 hover:bg-slate-100">
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={() => onSave(selectedAgentId || undefined)}
              disabled={!selectionChanged}
              className="h-10 bg-blue-600 px-5 text-xs font-bold text-white hover:bg-blue-700 rounded-xl shadow-sm disabled:opacity-50"
            >
              Guardar responsable
            </Button>
          </footer>
        </div>
      </DialogContent>
    </Dialog>
  );
}
