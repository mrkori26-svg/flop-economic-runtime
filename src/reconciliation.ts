import type { EconomicJournal, EconomicJournalRecord } from "./journal.js";
import type { SettlementPlan, SettlementRail } from "./types.js";
import { Treasury } from "./treasury.js";

const recordsFor = (journal:EconomicJournal,reservationId:string):EconomicJournalRecord[] =>
  journal.read().filter(r=>r.payload.reservationId===reservationId);

const requiredText = (record:EconomicJournalRecord,key:string):string => {
  const value=record.payload[key];
  if(typeof value!=="string" || !value) throw new Error("RECONCILIATION_FIELD_INVALID_"+key.toUpperCase());
  return value;
};

const requiredAmount = (record:EconomicJournalRecord,key:string):bigint => {
  const value=requiredText(record,key);
  if(!/^(0|[1-9][0-9]*)$/.test(value)) throw new Error("RECONCILIATION_AMOUNT_INVALID_"+key.toUpperCase());
  return BigInt(value);
};

function latest(records:EconomicJournalRecord[],type:string):EconomicJournalRecord|undefined {
  return [...records].reverse().find(r=>r.type===type);
}

function settlementPlan(records:EconomicJournalRecord[],reservationId:string):SettlementPlan {
  const record=latest(records,"SETTLEMENT_PLANNED");
  if(!record) throw new Error("RECONCILIATION_PLAN_MISSING");
  const policy=requiredText(record,"policy");
  if(policy!=="RETURN_RESIDUAL" && policy!=="FULL_RESERVED_PAYOUT") throw new Error("RECONCILIATION_POLICY_INVALID");  return {
    reservationId,
    asset:requiredText(record,"asset"),
    gross:requiredAmount(record,"gross"),
    fee:requiredAmount(record,"fee"),
    payout:requiredAmount(record,"payout"),
    residual:requiredAmount(record,"residual"),
    policy
  };
}

export type ReconciliationResult = {
  reservationId:string;
  railId:string;
  railRef:string;
  observedStatus:"LOCKED"|"SETTLED"|"RELEASED"|"UNKNOWN";
  status:"PENDING"|"SETTLED"|"RELEASED";
  durable:boolean;
};

export async function reconcileReservationFromRail(input:{
  reservationId:string;
  treasury:Treasury;
  journal:EconomicJournal;
  rail:SettlementRail;
  now?:Date;
}):Promise<ReconciliationResult> {
  const {reservationId,treasury,journal,rail}=input;
  const now=input.now??new Date();
  if(!journal.verify()) throw new Error("ECONOMIC_JOURNAL_INTEGRITY_FAILURE");
  const reservation=treasury.reservations.get(reservationId);
  if(!reservation) throw new Error("RECONCILIATION_RESERVATION_NOT_FOUND");
  const records=recordsFor(journal,reservationId);
  const lock=latest(records,"RAIL_LOCKED");  if(!lock) throw new Error("RECONCILIATION_RAIL_REF_MISSING");
  const railId=requiredText(lock,"railId");
  const railRef=requiredText(lock,"railRef");
  if(railId!==rail.id) throw new Error("RECONCILIATION_RAIL_ID_MISMATCH");

  const settled=latest(records,"RAIL_SETTLED");
  const released=latest(records,"RESERVATION_RELEASED");
  const terminal=[settled,released].filter(Boolean).sort((a,b)=>(a!.seq-b!.seq)).at(-1);
  if(terminal?.type==="RAIL_SETTLED"){
    if(reservation.status==="RESERVED") treasury.markSettlement(reservationId,settlementPlan(records,reservationId),new Date(terminal.at));
    else if(reservation.status!=="SETTLED") throw new Error("RECONCILIATION_TERMINAL_CONFLICT");
    return {reservationId,railId,railRef,observedStatus:"SETTLED",status:"SETTLED",durable:true};
  }
  if(terminal?.type==="RESERVATION_RELEASED"){
    if(reservation.status==="RESERVED") treasury.release(reservationId,new Date(terminal.at));
    else if(reservation.status!=="RELEASED") throw new Error("RECONCILIATION_TERMINAL_CONFLICT");
    return {reservationId,railId,railRef,observedStatus:"RELEASED",status:"RELEASED",durable:true};
  }
  if(reservation.status!=="RESERVED") throw new Error("RECONCILIATION_STATE_CONFLICT");
  if(typeof rail.observe!=="function") throw new Error("RECONCILIATION_OBSERVATION_UNAVAILABLE");

  const observed=await rail.observe(railRef);
  if(observed.status==="UNKNOWN") return {reservationId,railId,railRef,observedStatus:"UNKNOWN",status:"PENDING",durable:false};
  const expected=observed.status==="SETTLED" ? settlementPlan(records,reservationId).gross : reservation.reserved;
  if(observed.amount===undefined) throw new Error("RECONCILIATION_AMOUNT_REQUIRED");
  if(observed.amount!==expected) throw new Error("RECONCILIATION_AMOUNT_MISMATCH");  if(observed.status==="LOCKED") return {reservationId,railId,railRef,observedStatus:"LOCKED",status:"PENDING",durable:false};

  if(observed.status==="SETTLED"){
    const plan=settlementPlan(records,reservationId);
    journal.append("RAIL_SETTLED",{
      reservationId,railId,railRef,gross:plan.gross,source:"rail.observe",reconciled:true
    },now);
    treasury.markSettlement(reservationId,plan,now);
    return {reservationId,railId,railRef,observedStatus:"SETTLED",status:"SETTLED",durable:true};
  }

  journal.append("RESERVATION_RELEASED",{
    reservationId,railId,railRef,reason:"rail_observed_released",source:"rail.observe",reconciled:true
  },now);
  treasury.release(reservationId,now);
  return {reservationId,railId,railRef,observedStatus:"RELEASED",status:"RELEASED",durable:true};
}
