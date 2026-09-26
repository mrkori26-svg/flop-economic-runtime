import { createHash } from "node:crypto";
import type { LedgerEntry } from "./types.js";

export function canonicalLedger(entries: LedgerEntry[]): string {
  return entries.map(e=>JSON.stringify({...e,amount:e.amount.toString()})).join("\n");
}
export function ledgerHash(entries: LedgerEntry[]): string {
  return createHash("sha256").update(canonicalLedger(entries)).digest("hex");
}
export function reconcile(entries: LedgerEntry[]): {
  balanced:boolean;
  reserved:Record<string,bigint>;
  settled:Record<string,bigint>;
  fees:Record<string,bigint>;
  payouts:Record<string,bigint>;
  residualReturns:Record<string,bigint>;
} {
  const reserved:Record<string,bigint>={}, settled:Record<string,bigint>={}, fees:Record<string,bigint>={}, payouts:Record<string,bigint>={}, residualReturns:Record<string,bigint>={};
  const byReservation=new Map<string,LedgerEntry[]>();
  for(const e of entries){
    if(e.type==="RESERVE") reserved[e.asset]=(reserved[e.asset]??0n)+e.amount;
    if(e.type==="SETTLE") settled[e.asset]=(settled[e.asset]??0n)+e.amount;
    if(e.type==="FEE") fees[e.asset]=(fees[e.asset]??0n)+e.amount;
    if(e.type==="PAYOUT") payouts[e.asset]=(payouts[e.asset]??0n)+e.amount;
    if(e.type==="RESIDUAL_RETURN") residualReturns[e.asset]=(residualReturns[e.asset]??0n)+e.amount;
    if(e.ref){const list=byReservation.get(e.ref)??[];list.push(e);byReservation.set(e.ref,list);}
  }
  let balanced=true;
  for(const list of byReservation.values()){
    const amount=(type:LedgerEntry["type"])=>list.filter(x=>x.type===type).reduce((n,x)=>n+x.amount,0n);
    const reserve=amount("RESERVE"), gross=amount("SETTLE"), fee=amount("FEE"), payout=amount("PAYOUT"), residual=amount("RESIDUAL_RETURN");
    const hasAllocationDetail = fee>0n || payout>0n || residual>0n;
    if(gross>0n && hasAllocationDetail && (gross+residual!==reserve || fee+payout!==gross)) balanced=false;
    if(gross>reserve) balanced=false;
  }
  return {balanced,reserved,settled,fees,payouts,residualReturns};
}
