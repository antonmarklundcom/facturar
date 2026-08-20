import type { DocumentStatus } from "@/db/schema";

/**
 * Status tone. The colour says what to do about it, not what it is called:
 * accepted is done, rejected is dead, expired needs a new validity date, sent
 * is waiting on the customer.
 */
export function statusTone(
  status: DocumentStatus,
): "ok" | "warn" | "danger" | "info" | "muted" {
  if (status === "aceptado" || status === "pagada") return "ok";
  if (status === "rechazado" || status === "anulada") return "danger";
  if (status === "vencido" || status === "vencida" || status === "parcial") return "warn";
  if (status === "enviado" || status === "pendiente") return "info";
  return "muted";
}
