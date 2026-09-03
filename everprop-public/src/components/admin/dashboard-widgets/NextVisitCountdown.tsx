"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { leads as sampleLeads, properties as sampleProperties, type Visit } from "@/data/admin-sample";
import { loadLeadList, loadPropertyList } from "@/lib/admin-storage";
import { useCurrentSession } from "@/hooks/use-current-session";
import { useDashboardMode } from "@/lib/dashboard-context";
import { Clock, MapPin, User, Phone, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { deferEffectUpdate } from "@/lib/deferred-effect";

type EnrichedVisit = Visit & {
  leadName: string;
  propertyTitle?: string;
  propertyType?: string;
  phone?: string;
};

function useCountdown(targetDate: string | undefined) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  if (!targetDate) return null;

  const diff = new Date(targetDate).getTime() - now;
  if (diff <= 0) return { hours: 0, minutes: 0, seconds: 0, isOverdue: true };

  const totalSeconds = Math.floor(diff / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return { hours, minutes, seconds, isOverdue: false };
}

function TimeUnit({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col items-center">
      <AnimatePresence mode="wait">
        <motion.span
          key={value}
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={{ duration: 0.15 }}
          className="text-2xl font-black text-slate-900 tabular-nums leading-none w-10 text-center"
        >
          {String(value).padStart(2, "0")}
        </motion.span>
      </AnimatePresence>
      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1">{label}</span>
    </div>
  );
}

export default function NextVisitCountdown() {
  const { isAdvisor, isAdmin, user } = useCurrentSession();
  const { globalSelectedAgentId } = useDashboardMode();
  const [nextVisit, setNextVisit] = useState<EnrichedVisit | null>(null);

  useEffect(() => {
    return deferEffectUpdate(() => {
      let leads = loadLeadList(sampleLeads, "c1");
    const properties = loadPropertyList(sampleProperties, "c1");

    const effectiveAgentId = isAdvisor ? user?.id : globalSelectedAgentId;
    if (effectiveAgentId && effectiveAgentId !== "all") {
      leads = leads.filter((l) => l.agentId === effectiveAgentId);
    }

    const now = Date.now();

    const allVisits: EnrichedVisit[] = leads.flatMap((lead) =>
      (lead.visits ?? []).map((v) => {
        const prop = properties.find((p) => p.id === v.propertyId);
        return {
          ...v,
          leadName: v.leadName || lead.name,
          propertyTitle: v.propertyTitle || prop?.title,
          propertyType: prop?.propertyType,
          phone: v.phone || lead.phone,
        };
      })
    );

    const upcoming = allVisits
      .filter((v) => v.status === "scheduled" && new Date(v.scheduledAt).getTime() > now)
      .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());

      setNextVisit(upcoming[0] ?? null);
    });
  }, [isAdvisor, isAdmin, user, globalSelectedAgentId]);

  const countdown = useCountdown(nextVisit?.scheduledAt);

  // Guard after all hooks
  if (!isAdvisor && !isAdmin) return null;

  const dateStr = nextVisit
    ? new Date(nextVisit.scheduledAt).toLocaleDateString("es-AR", {
        weekday: "long",
        day: "numeric",
        month: "long",
      })
    : null;

  return (
    <div className="rounded-[2.5rem] border border-slate-200 bg-white shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-7 pt-7 pb-5 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="p-2.5 rounded-2xl bg-blue-600 text-white shadow-sm shadow-blue-200">
            <Clock className="h-5 w-5" />
          </span>
          <div>
            <h3 className="text-lg font-bold text-slate-900 leading-tight">Próxima Visita</h3>
            <p className="text-xs text-slate-500 font-medium mt-0.5">Cuenta regresiva en tiempo real</p>
          </div>
        </div>
        <Link href="/admin/agenda" className="text-xs font-bold text-blue-600 hover:text-blue-700">
          Ver agenda →
        </Link>
      </div>

      {!nextVisit ? (
        <div className="px-7 py-10 text-center">
          <Clock className="h-8 w-8 text-slate-200 mx-auto mb-2" />
          <p className="text-sm font-medium text-slate-400">No hay visitas programadas</p>
        </div>
      ) : (
        <div className="px-7 py-6">
          {/* Countdown Timer */}
          <div className={cn(
            "flex items-center justify-center gap-3 py-5 px-6 rounded-2xl mb-5",
            countdown?.isOverdue ? "bg-red-50" : "bg-blue-50"
          )}>
            <TimeUnit value={countdown?.hours ?? 0} label="hs" />
            <span className="text-2xl font-black text-slate-300 pb-4">:</span>
            <TimeUnit value={countdown?.minutes ?? 0} label="min" />
            <span className="text-2xl font-black text-slate-300 pb-4">:</span>
            <TimeUnit value={countdown?.seconds ?? 0} label="seg" />
          </div>

          {/* Visit Details */}
          <div className="space-y-3">
            <div className="flex items-center gap-2.5">
              <span className="h-7 w-7 rounded-xl bg-slate-100 flex items-center justify-center flex-shrink-0">
                <User className="h-3.5 w-3.5 text-slate-500" />
              </span>
              <div>
                <p className="text-sm font-bold text-slate-900 leading-none">{nextVisit.leadName}</p>
                {nextVisit.phone && (
                  <p className="text-xs text-slate-500 mt-0.5">{nextVisit.phone}</p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              <span className="h-7 w-7 rounded-xl bg-slate-100 flex items-center justify-center flex-shrink-0">
                <MapPin className="h-3.5 w-3.5 text-slate-500" />
              </span>
              <p className="text-sm font-semibold text-slate-700 leading-tight">
                {nextVisit.propertyTitle || "Propiedad sin título"}
              </p>
            </div>

            <div className="flex items-center gap-2.5">
              <span className="h-7 w-7 rounded-xl bg-slate-100 flex items-center justify-center flex-shrink-0">
                <Calendar className="h-3.5 w-3.5 text-slate-500" />
              </span>
              <p className="text-xs font-semibold text-slate-500 capitalize">{dateStr}</p>
            </div>
          </div>

          {/* Quick WhatsApp reminder */}
          {nextVisit.phone && (
            <a
              href={`https://wa.me/${nextVisit.phone.replace(/[^0-9]/g, "")}?text=Hola%20${encodeURIComponent(nextVisit.leadName)}%2C%20te%20recordamos%20tu%20visita%20de%20hoy%20a%20las%20${encodeURIComponent(new Date(nextVisit.scheduledAt).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" }))}hs.`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold transition-colors"
            >
              <Phone className="h-4 w-4" />
              Enviar Recordatorio por WhatsApp
            </a>
          )}
        </div>
      )}
    </div>
  );
}
