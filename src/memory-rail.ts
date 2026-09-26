import { randomUUID } from "node:crypto";
import type { Reservation, SettlementPlan, SettlementRail } from "./types.js";

type RecordState={reservation:Reservation;status:"LOCKED"|"SETTLED"|"RELEASED";plan?:SettlementPlan};
export class MemoryRail implements SettlementRail {
  readonly id="memory-rail";
  private records=new Map<string,RecordState>();
  async reserve({reservation}:{reservation:Reservation}){const ref=randomUUID();this.records.set(ref,{reservation,status:"LOCKED"});return{ref};}
  async settle({reservation,plan,ref}:{reservation:Reservation;plan:SettlementPlan;ref:string}){
    const r=this.records.get(ref); if(!r||r.status!=="LOCKED"||r.reservation.id!==reservation.id) throw new Error("RAIL_LOCK_MISMATCH");
    r.status="SETTLED";r.plan=plan;return{txRef:randomUUID()};
  }
  async release({reservation,ref}:{reservation:Reservation;ref:string}){
    const r=this.records.get(ref); if(!r||r.status!=="LOCKED"||r.reservation.id!==reservation.id) throw new Error("RAIL_LOCK_MISMATCH");
    r.status="RELEASED";return{txRef:randomUUID()};
  }
  async observe(ref:string){const r=this.records.get(ref);return r?{status:r.status,amount:r.plan?.gross}:{status:"UNKNOWN" as const};}
}
