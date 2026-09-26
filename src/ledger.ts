import { createHash } from "node:crypto";
import type { LedgerEntry } from "./types.js";

export function canonicalLedger(entries: LedgerEntry[]): string {
  return entries.map(e=>JSON.stringify({...e,amount:e.amount.toString()})).join("\n");
}
export function ledgerHash(entries: LedgerEntry[]): string {
  return createHash("sha256").update(canonicalLedger(entries)).digest("hex");
}
export function reconcile(entries: LedgerEntry[]): {balanced:boolean; reserved:Record<string,bigint>; settled:Record<string,bigint>} {
  const reserved:Record<string,bigint>={}, settled:Record<string,bigint>={};
  for(const e of entries){
    if(e.type==="RESERVE") reserved[e.asset]=(reserved[e.asset]??0n)+e.amount;
    if(e.type==="SETTLE") settled[e.asset]=(settled[e.asset]??0n)+e.amount;
  }
  return {balanced:Object.keys(settled).every(a=>(settled[a]??0n)<=(reserved[a]??0n)),reserved,settled};
}
