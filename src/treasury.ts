import { randomUUID } from "node:crypto";
import type { LedgerEntry, Reservation, SettlementPlan, TreasuryPolicy } from "./types.js";

export class Treasury {
  readonly ledger: LedgerEntry[] = [];
  readonly reservations = new Map<string, Reservation>();
  constructor(readonly policy: TreasuryPolicy) {}

  spentToday(now = new Date(), asset?: string): bigint {
    const day = now.toISOString().slice(0,10);
    return this.ledger
      .filter(x=>x.type==="SETTLE" && x.at.startsWith(day) && (asset === undefined || x.asset === asset))
      .reduce((n,x)=>n+x.amount,0n);
  }

  reserve(input:{counterparty:string; asset:string; amount:bigint; expiresAt:string; now?:Date}): Reservation {
    const now = input.now ?? new Date();
    if (input.amount <= 0n) throw new Error("TREASURY_AMOUNT_INVALID");
    if (!this.policy.allowedAssets.includes(input.asset)) throw new Error("TREASURY_ASSET_DENIED");
    if (this.policy.allowedCounterparties && !this.policy.allowedCounterparties.includes(input.counterparty)) throw new Error("TREASURY_COUNTERPARTY_DENIED");
    if (input.amount > this.policy.maxPerSettlement) throw new Error("TREASURY_PER_SETTLEMENT_LIMIT");
    const outstanding = [...this.reservations.values()].filter(x=>x.status==="RESERVED" && x.asset===input.asset).reduce((n,x)=>n+x.reserved,0n);
    if (this.spentToday(now,input.asset) + outstanding + input.amount > this.policy.maxDailySpend) throw new Error("TREASURY_DAILY_LIMIT");
    const reservation: Reservation = {id:randomUUID(), counterparty:input.counterparty, asset:input.asset, reserved:input.amount, createdAt:now.toISOString(), expiresAt:input.expiresAt, status:"RESERVED"};
    this.reservations.set(reservation.id,reservation);
    this.ledger.push({id:randomUUID(),at:now.toISOString(),type:"RESERVE",asset:input.asset,amount:input.amount,counterparty:input.counterparty,ref:reservation.id});
    return reservation;
  }

  markSettled(id:string, amount:bigint, now=new Date()): void {
    const r=this.mustReserved(id);
    if(amount < 0n) throw new Error("TREASURY_SETTLEMENT_AMOUNT_INVALID");
    if(amount>r.reserved) throw new Error("TREASURY_OVERSPEND");
    r.status="SETTLED";
    this.ledger.push({id:randomUUID(),at:now.toISOString(),type:"SETTLE",asset:r.asset,amount,counterparty:r.counterparty,ref:r.id});
  }

  markSettlement(id:string, plan:SettlementPlan, now=new Date()): void {
    const r=this.mustReserved(id);
    if(plan.asset!==r.asset || plan.reservationId!==r.id) throw new Error("TREASURY_SETTLEMENT_BINDING_MISMATCH");
    if(plan.gross<0n || plan.fee<0n || plan.payout<0n || plan.residual<0n) throw new Error("TREASURY_SETTLEMENT_AMOUNT_INVALID");
    if(plan.gross>r.reserved || plan.fee+plan.payout!==plan.gross || plan.gross+plan.residual!==r.reserved) throw new Error("TREASURY_SETTLEMENT_CONSERVATION_FAILURE");
    r.status="SETTLED";
    const common={at:now.toISOString(),asset:r.asset,counterparty:r.counterparty,ref:r.id};
    this.ledger.push({id:randomUUID(),...common,type:"SETTLE",amount:plan.gross});
    if(plan.payout>0n)this.ledger.push({id:randomUUID(),...common,type:"PAYOUT",amount:plan.payout});
    if(plan.fee>0n)this.ledger.push({id:randomUUID(),...common,type:"FEE",amount:plan.fee});
    if(plan.residual>0n)this.ledger.push({id:randomUUID(),...common,type:"RESIDUAL_RETURN",amount:plan.residual});
  }

  release(id:string, now=new Date()): void {
    const r=this.mustReserved(id); r.status="RELEASED";
    this.ledger.push({id:randomUUID(),at:now.toISOString(),type:"RELEASE",asset:r.asset,amount:r.reserved,counterparty:r.counterparty,ref:r.id});
  }

  private mustReserved(id:string): Reservation {
    const r=this.reservations.get(id); if(!r) throw new Error("RESERVATION_NOT_FOUND"); if(r.status!=="RESERVED") throw new Error("RESERVATION_NOT_ACTIVE"); return r;
  }
}
