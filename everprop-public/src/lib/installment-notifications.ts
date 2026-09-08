import type { Installment, InstallmentStatus, PaymentAgreement } from "@/data/admin-sample";

/**
 * Returns today's date formatted as YYYY-MM-DD in local time
 */
export function getTodayDateString(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Formats a currency amount according to corporate standards
 */
export function formatInstallmentAmount(amount: number, currency: "ARS" | "USD" = "ARS"): string {
  if (currency === "USD") {
    return `USD ${amount.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  return `$ ${amount.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Formats a date string (YYYY-MM-DD) to DD/MM/YYYY
 */
export function formatDueDate(dateStr: string): string {
  if (!dateStr) return "-";
  const parts = dateStr.split("T")[0].split("-");
  if (parts.length === 3) {
    const [year, month, day] = parts;
    return `${day}/${month}/${year}`;
  }
  return dateStr;
}

/**
 * Evaluates live dynamic status and days overdue for an installment
 */
export function evaluateInstallmentStatus(
  installment: Installment,
  todayStr: string = getTodayDateString()
): { status: InstallmentStatus; daysOverdue: number } {
  if (installment.serverManaged) return { status: installment.status, daysOverdue: installment.daysOverdue };
  if (installment.status === "PAID" || installment.status === "CANCELLED") {
    return { status: installment.status, daysOverdue: 0 };
  }

  const cleanDueDate = installment.dueDate.split("T")[0];

  if (cleanDueDate === todayStr) {
    return { status: "DUE_TODAY", daysOverdue: 0 };
  }

  if (cleanDueDate < todayStr) {
    const dueTime = new Date(`${cleanDueDate}T00:00:00`).getTime();
    const todayTime = new Date(`${todayStr}T00:00:00`).getTime();
    const diffDays = Math.max(1, Math.round((todayTime - dueTime) / 86400000));
    return { status: "OVERDUE", daysOverdue: diffDays };
  }

  return { status: "PENDING", daysOverdue: 0 };
}

/**
 * Cleans a phone number for wa.me links
 */
export function cleanPhoneNumber(phone?: string): string {
  if (!phone) return "";
  const numeric = phone.replace(/[^0-9]/g, "");
  if (numeric.startsWith("388") || numeric.startsWith("11") || numeric.startsWith("351")) {
    return `549${numeric}`;
  }
  return numeric;
}

/**
 * Generates a corporate, professional WhatsApp reminder text (no emojis)
 */
export function buildInstallmentWhatsAppMessage(
  lead: { name: string },
  agreement: { projectName?: string; propertyTitle?: string; totalInstallments: number },
  installment: Installment
): string {
  const statusInfo = evaluateInstallmentStatus(installment);
  const propertyLabel = agreement.projectName 
    ? (agreement.propertyTitle ? `${agreement.projectName} (${agreement.propertyTitle})` : agreement.projectName)
    : (agreement.propertyTitle || "su plan de financiación");

  const amountStr = formatInstallmentAmount(installment.amountRemaining ?? installment.amountExpected, installment.currency);
  const dateFormatted = formatDueDate(installment.dueDate);
  const installmentRatio = `${installment.installmentNumber}/${agreement.totalInstallments}`;

  if (statusInfo.status === "OVERDUE") {
    const daysStr = statusInfo.daysOverdue === 1 ? "1 día" : `${statusInfo.daysOverdue} días`;
    return `Estimado/a ${lead.name}, le contactamos desde Bellomo Inversiones para recordarle que la cuota ${installmentRatio} de ${propertyLabel} por ${amountStr} registra vencimiento el día ${dateFormatted} (${daysStr} de mora). Le solicitamos tenga a bien enviarnos el comprobante de transferencia a este medio. Saludos cordiales.`;
  }

  if (statusInfo.status === "DUE_TODAY") {
    return `Estimado/a ${lead.name}, le recordamos desde Bellomo Inversiones que en el día de hoy opera el vencimiento de la cuota ${installmentRatio} de ${propertyLabel} por ${amountStr}. Agradeceremos remitir el comprobante de pago a la brevedad. Saludos cordiales.`;
  }

  return `Estimado/a ${lead.name}, le recordamos desde Bellomo Inversiones que la cuota ${installmentRatio} de ${propertyLabel} por un importe de ${amountStr} tiene fecha de vencimiento programada para el día ${dateFormatted}. Saludos cordiales.`;
}

/**
 * Builds the complete wa.me link
 */
export function buildWhatsAppReminderUrl(
  phone: string | undefined,
  lead: { name: string },
  agreement: { projectName?: string; propertyTitle?: string; totalInstallments: number },
  installment: Installment
): string | null {
  const clean = cleanPhoneNumber(phone);
  if (!clean) return null;
  const message = buildInstallmentWhatsAppMessage(lead, agreement, installment);
  return `https://wa.me/${clean}?text=${encodeURIComponent(message)}`;
}
