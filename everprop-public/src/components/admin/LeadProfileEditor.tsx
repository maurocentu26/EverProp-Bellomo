"use client";

import { useState, type FormEvent } from "react";
import { Save, UserRoundPen, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { Lead } from "@/data/admin-sample";

const DEFAULT_ORIGINS = ["Web", "WhatsApp", "Portal", "Referido", "Instagram"];

type LeadProfileEditorProps = {
  lead: Lead;
  onClose: () => void;
  onSave: (lead: Lead) => void;
};

export function LeadProfileEditor({ lead, onClose, onSave }: LeadProfileEditorProps) {
  const [name, setName] = useState(lead.name);
  const [phone, setPhone] = useState(lead.phone ?? "");
  const [email, setEmail] = useState(lead.email ?? "");
  const [origin, setOrigin] = useState(lead.origin);
  const [stage, setStage] = useState<Lead["stage"]>(lead.stage);
  const [notes, setNotes] = useState(lead.notes ?? "");
  const origins = DEFAULT_ORIGINS.includes(lead.origin) ? DEFAULT_ORIGINS : [lead.origin, ...DEFAULT_ORIGINS];

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSave({
      ...lead,
      name: name.trim(),
      phone: phone.trim() || undefined,
      email: email.trim() || undefined,
      origin,
      stage,
      notes: notes.trim() || undefined,
      lastActivity: new Date().toISOString(),
    });
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto p-6 bg-white rounded-2xl shadow-xl">
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
              <UserRoundPen className="size-5" aria-hidden="true" />
            </span>
            <div>
              <DialogTitle className="text-xl font-bold text-slate-900">Editar Ficha del Cliente</DialogTitle>
              <DialogDescription className="text-xs text-slate-500 mt-0.5">
                Actualizá los datos de contacto y etapa comercial del lead.
              </DialogDescription>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="block text-xs font-semibold text-slate-700 sm:col-span-2">
              Nombre completo <span className="text-rose-500">*</span>
              <Input
                required
                minLength={2}
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="mt-1 h-10 border-slate-200 text-sm"
              />
            </label>

            <label className="block text-xs font-semibold text-slate-700">
              WhatsApp / Teléfono
              <Input
                type="tel"
                inputMode="tel"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                className="mt-1 h-10 border-slate-200 text-sm"
                placeholder="+54 9..."
              />
            </label>

            <label className="block text-xs font-semibold text-slate-700">
              Email
              <Input
                type="email"
                inputMode="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="mt-1 h-10 border-slate-200 text-sm"
                placeholder="cliente@ejemplo.com"
              />
            </label>

            <label className="block text-xs font-semibold text-slate-700">
              Origen
              <select
                value={origin}
                onChange={(event) => setOrigin(event.target.value)}
                className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-blue-500"
              >
                {origins.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>

            <label className="block text-xs font-semibold text-slate-700">
              Estado / Etapa
              <select
                value={stage}
                onChange={(event) => setStage(event.target.value as Lead["stage"])}
                className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-blue-500"
              >
                <option value="new">Nuevo</option>
                <option value="contacted">Contactado</option>
                <option value="visiting">Visitando</option>
                <option value="negotiation">Negociación</option>
                <option value="closing">Cierre</option>
              </select>
            </label>

            <label className="block text-xs font-semibold text-slate-700 sm:col-span-2">
              Notas generales
              <Textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                rows={3}
                className="mt-1 text-sm border-slate-200 rounded-lg"
                placeholder="Detalles sobre el interés, presupuesto o conversaciones..."
              />
            </label>
          </div>

          <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              className="h-9 px-4 text-xs font-semibold"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              size="sm"
              className="h-9 px-5 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white gap-1.5"
            >
              <Save className="size-3.5" aria-hidden="true" /> Guardar Cambios
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
