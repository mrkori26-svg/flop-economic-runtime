import type { Quote } from "./types.js";

export type QuoteRequest = {
  service:string;
  asset:string;
  unit:string;
  comparisonProfile:string;
  requiredCapabilities?:string[];
  maxUnitPrice?:bigint;
  minUnits?:bigint;
};

export function rankQuotes(request: QuoteRequest, quotes: Quote[], now = new Date()): Quote[] {
  if (!request.asset || !request.unit || !request.comparisonProfile) throw new Error("QUOTE_COMPARISON_PROFILE_REQUIRED");
  const required = new Set(request.requiredCapabilities ?? []);
  return quotes.filter(q => {
    if (new Date(q.expiresAt).getTime() <= now.getTime()) return false;
    if (q.asset !== request.asset || q.unit !== request.unit || q.comparisonProfile !== request.comparisonProfile) return false;
    if (request.maxUnitPrice !== undefined && q.unitPrice > request.maxUnitPrice) return false;
    if (request.minUnits !== undefined && q.maxUnits < request.minUnits) return false;
    for (const cap of required) if (!q.capabilities.includes(cap)) return false;
    return q.service === request.service;
  }).sort((a,b) => {
    if (a.unitPrice !== b.unitPrice) return a.unitPrice < b.unitPrice ? -1 : 1;
    if (a.maxUnits !== b.maxUnits) return a.maxUnits > b.maxUnits ? -1 : 1;
    return a.id.localeCompare(b.id);
  });
}
