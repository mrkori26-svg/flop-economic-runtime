import { randomUUID } from "node:crypto";
import type { EconomicJournal, EconomicJournalRecord } from "./journal.js";
import type { Reservation, SettlementPlan, TreasuryPolicy } from "./types.js";
import { Treasury } from "./treasury.js";

const text = (record:EconomicJournalRecord,key:string):string => {
  const value=record.payload[key];
  if(typeof value!=="string" || !value) throw new Error("ECONOMIC_RECOVERY_FIELD_INVALID_"+key.toUpperCase());
  return value;
};

const amount = (record:EconomicJournalRecord,key:string):bigint => {
  const value=text(record,key);
  if(!/^(0|[1-9][0-9]*)$/.test(value)) throw new Error("ECONOMIC_RECOVERY_AMOUNT_INVALID_"+key.toUpperCase());
  return BigInt(value);
};

type Planned = Pick<SettlementPlan,"gross"|"fee"|"payout"|"residual"|"asset"|"policy">;

export type EconomicRecovery = {
  treasury:Treasury;
  unresolved:string[];
  recoveredRecords:number;
};

export function recoverTreasuryFromJournal(policy:TreasuryPolicy,journal:EconomicJournal):EconomicRecovery {
  if(!journal.verify()) throw new Error("ECONOMIC_JOURNAL_INTEGRITY_FAILURE");
  const treasury=new Treasury(policy);
  const plans=new Map<string,Planned>();
  for(const record of journal.read()){
    const reservationId=typeof record.payload.reservationId==="string"?record.payload.reservationId:null;
    if(record.type==="RESERVATION_AUTHORIZED"){
      if(!reservationId) throw new Error("ECONOMIC_RECOVERY_RESERVATION_ID_MISSING");
      const reservation:Reservation={
        id:reservationId,
        counterparty:text(record,"counterparty"),
        asset:text(record,"asset"),
        reserved:amount(record,"reserved"),
        createdAt:typeof record.payload.createdAt==="string"?record.payload.createdAt:record.at,
        expiresAt:text(record,"expiresAt"),
        status:"RESERVED"
      };
      if(treasury.reservations.has(reservation.id)) throw new Error("ECONOMIC_RECOVERY_DUPLICATE_RESERVATION");
      treasury.reservations.set(reservation.id,reservation);
      treasury.ledger.push({id:randomUUID(),at:record.at,type:"RESERVE",asset:reservation.asset,amount:reservation.reserved,counterparty:reservation.counterparty,ref:reservation.id});
    } else if(record.type==="SETTLEMENT_PLANNED"){
      if(!reservationId) throw new Error("ECONOMIC_RECOVERY_RESERVATION_ID_MISSING");
      plans.set(reservationId,{
        gross:amount(record,"gross"), fee:amount(record,"fee"), payout:amount(record,"payout"), residual:amount(record,"residual"),
        asset:text(record,"asset"), policy:text(record,"policy") as SettlementPlan["policy"]
      });
    } else if(record.type==="RAIL_SETTLED"){
      if(!reservationId) throw new Error("ECONOMIC_RECOVERY_RESERVATION_ID_MISSING");
      const reservation=treasury.reservations.get(reservationId);
      const plan=plans.get(reservationId);
      if(!reservation || !plan || reservation.status!=="RESERVED") throw new Error("ECONOMIC_RECOVERY_SETTLEMENT_SEQUENCE_INVALID");
      treasury.markSettlement(reservationId,{reservationId,...plan},new Date(record.at));
    } else if(record.type==="RESERVATION_RELEASED"){
      if(!reservationId) throw new Error("ECONOMIC_RECOVERY_RESERVATION_ID_MISSING");
      const reservation=treasury.reservations.get(reservationId);
      if(!reservation) throw new Error("ECONOMIC_RECOVERY_RELEASE_SEQUENCE_INVALID");
      if(reservation.status==="RESERVED") treasury.release(reservationId,new Date(record.at));
      else if(reservation.status!=="RELEASED") throw new Error("ECONOMIC_RECOVERY_RELEASE_SEQUENCE_INVALID");
    }
  }

  return {
    treasury,
    unresolved:[...treasury.reservations.values()].filter(x=>x.status==="RESERVED").map(x=>x.id).sort(),
    recoveredRecords:journal.read().length
  };
}
