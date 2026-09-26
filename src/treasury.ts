import { randomUUID } from "node:crypto";
import type { LedgerEntry, Reservation, TreasuryPolicy } from "./types.js";

export class Treasury {
  readonly ledger: LedgerEntry[] = [];
  readonly reservations = new Map<string, Reservation>();
  constructor(readonly policy: TreasuryPolicy) {}

  spentToday(now = new Date()): bigint {
    const day = now.toISOString().slice(0,10);
    return this.ledger.filter(x=>x.type==="SETTLE" && x.at.startsWith(day)).reduce((n,x)=>n+x.amount,0n);
  }

  reserve(input:{counterparty:string; asset:string; amount:bigint; expiresAt:string; now?:Date}): Reservation {
    const now = input.now ?? new Date();
    if (input.amount <= 0n) throw new Error("TREASURY_AMOUNT_INVALID");
    if (!this.policy.allowedAssets.includes(input.asset)) throw new Error("TREASURY_ASSET_DENIED");
    if (this.policy.allowedCounterparties && !this.policy.allowedCounterparties.includes(input.counterparty)) throw new Error("TREASURY_COUNTERPARTY_DENIED");
    if (input.amount > this.policy.maxPerSettlement) throw new Error("TREASURY_PER_SETTLEMENT_LIMIT");
    const outstanding = [...this.reservations.values()].filter(x=>x.status==="RESERVED" && x.asset===input.asset).reduce((n,x)=>n+x.reserved,0n);
    if (this.spentToday(now) + outstanding + input.amount > this.policy.maxDailySpend) throw new Error("TREASURY_DAILY_LIMIT");
    const reservation: Reservation = {id:randomUUID(), counterparty:input.counterparty, asset:input.asset, reserved:input.amount, createdAt:now.toISOString(), expiresAt:input.expiresAt, status:"RESERVED"};
    this.reservations.set(reservation.id,reservation);
    this.ledger.push({id:randomUUID(),at:now.toISOString(),type:"RESERVE",asset:input.asset,amount:input.amount,counterparty:input.counterparty,ref:reservation.id});
    return reservation;
  }

  markSettled(id:string, amount:bigint, now=new Date()): void {
    const r=this.mustReserved(id); if(amount>r.reserved) throw new Error("TREASURY_OVERSPEND");
    r.status="SETTLED";
    this.ledger.push({id:randomUUID(),at:now.toISOString(),type:"SETTLE",asset:r.asset,amount,counterparty:r.counterparty,ref:r.id});
  }

  release(id:string, now=new Date()): void {
    const r=this.mustReserved(id); r.status="RELEASED";
    this.ledger.push({id:randomUUID(),at:now.toISOString(),type:"RELEASE",asset:r.asset,amount:r.reserved,counterparty:r.counterparty,ref:r.id});
  }

  private mustReserved(id:string): Reservation {
    const r=this.reservations.get(id); if(!r) throw new Error("RESERVATION_NOT_FOUND"); if(r.status!=="RESERVED") throw new Error("RESERVATION_NOT_ACTIVE"); return r;
  }
}
