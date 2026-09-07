"use client";

import { useState } from "react";
import { ArrowRightLeft, CalendarCheck, Check, CheckCircle2, MessageSquare, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { type Lead } from "@/data/admin-sample";
import { cn } from "@/lib/utils";

export interface StageOption {
  key: Exclude<Lead["stage"], "new">;
  title: string;
  badge: string;
  description: string;
  icon: typeof MessageSquare;
  borderClass: string;
  badgeClass: string;
}

const STAGE_OPTIONS: StageOption[] = [
  {
    key: "contacted",
    title: "Contactado",
    badge: "Primer contacto",
    description: "Contacto establecido exitosamente. Evaluando perfil, presupuesto o necesidad inicial.",
    icon: MessageSquare,
    borderClass: "border-blue-500 bg-blue-50/50 dark:bg-blue-950/20 dark:border-blue-800",
    badgeClass: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
  },
  {
    key: "visiting",
    title: "En Visita",
    badge: "Visita en curso",
    description: "Visita presencial o virtual coordinada, agendada o realizada a la propiedad o lote.",
    icon: CalendarCheck,
    borderClass: "border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/20 dark:border-indigo-800",
    badgeClass: "bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300",
  },
  {
    key: "negotiation",
    title: "En Negociación",
    badge: "Oferta activa",
    description: "Propuesta formal presentada, formas de pago enviadas o contraoferta en discusión.",
    icon: TrendingUp,
    borderClass: "border-amber-500 bg-amber-50/50 dark:bg-amber-950/20 dark:border-amber-800",
    badgeClass: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  },
  {
    key: "closing",
    title: "Cierre / Ganado",
    badge: "Compromiso firme",
    description: "Reserva de lote o inmueble abonada, o firma de boleto de compraventa concretada.",
    icon: CheckCircle2,
    borderClass: "border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20 dark:border-emerald-800",
    badgeClass: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  },
];

interface LeadStageUpdateModalProps {
  open: boolean;
  leadName: string;
  currentStage?: string;
  onClose: () => void;
  onConfirm: (selectedStage: Exclude<Lead["stage"], "new">) => Promise<void> | void;
}

export function LeadStageUpdateModal({
  open,
  leadName,
  currentStage,
  onClose,
  onConfirm,
}: LeadStageUpdateModalProps) {
  // Default to current stage if not 'new', otherwise default to 'contacted'
  const initialStage = (currentStage && currentStage !== "new"
    ? currentStage
    : "contacted") as Exclude<Lead["stage"], "new">;

  const [selectedStage, setSelectedStage] = useState<Exclude<Lead["stage"], "new">>(initialStage);
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onConfirm(selectedStage);
      onClose();
    } catch (e) {
      console.error(e);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-lg p-0 gap-0 overflow-hidden border border-border shadow-2xl">
        <DialogHeader className="border-b border-border bg-card p-5 text-left">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-700 dark:bg-blue-950/70 dark:text-blue-400">
              <ArrowRightLeft className="h-4 w-4" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold text-foreground">
                Actualizar etapa del prospecto
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                Acabás de registrar un contacto con <strong className="text-foreground">{leadName}</strong>. ¿A qué etapa comercial avanza?
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="p-5 space-y-2.5 max-h-[60vh] overflow-y-auto">
          {STAGE_OPTIONS.map((option) => {
            const Icon = option.icon;
            const isSelected = selectedStage === option.key;

            return (
              <button
                key={option.key}
                type="button"
                onClick={() => setSelectedStage(option.key)}
                className={cn(
                  "w-full flex items-start gap-3 rounded-xl border p-3.5 text-left transition-all",
                  isSelected
                    ? cn("ring-2 ring-blue-500/20", option.borderClass)
                    : "border-border bg-card hover:bg-accent/40 text-muted-foreground"
                )}
              >
                <div
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border",
                    isSelected
                      ? "border-blue-300 bg-white text-blue-700 dark:bg-slate-900 dark:border-blue-700 dark:text-blue-300 shadow-xs"
                      : "border-border bg-muted/50 text-muted-foreground"
                  )}
                >
                  <Icon className="h-4 w-4" />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          "text-xs font-bold",
                          isSelected ? "text-foreground font-extrabold" : "text-foreground"
                        )}
                      >
                        {option.title}
                      </span>
                      <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-md", option.badgeClass)}>
                        {option.badge}
                      </span>
                    </div>

                    <div
                      className={cn(
                        "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-colors",
                        isSelected
                          ? "border-blue-600 bg-blue-600 text-white"
                          : "border-muted-foreground/40 bg-transparent"
                      )}
                    >
                      {isSelected && <Check className="h-2.5 w-2.5 stroke-[3]" />}
                    </div>
                  </div>

                  <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                    {option.description}
                  </p>
                </div>
              </button>
            );
          })}
        </div>

        <DialogFooter className="border-t border-border bg-muted/20 px-5 py-3.5 sm:justify-between gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            disabled={isSaving}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Mantener etapa actual
          </Button>

          <Button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-xs"
          >
            {isSaving ? "Actualizando..." : "Actualizar Etapa"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
