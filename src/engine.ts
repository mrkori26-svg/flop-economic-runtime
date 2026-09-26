import type { MeterReading, PriceObservation, Quote, SettlementRail } from "./types.js";
import { evaluatePrice, type PriceGuardConfig } from "./price-guard.js";
import { rankQuotes, type QuoteRequest } from "./quotes.js";
import { Treasury } from "./treasury.js";
import { settlementAmount } from "./metering.js";
import { planSettlement, type SettlementPolicy } from "./settlement.js";
import type { EconomicJournal } from "./journal.js";

export class EconomicRuntime {
  constructor(
    readonly treasury:Treasury,
    readonly priceGuard:PriceGuardConfig,
    readonly settlementPolicy:SettlementPolicy,
    readonly journal?: EconomicJournal
  ) {}

  selectQuote(request:QuoteRequest, quotes:Quote[], now=new Date()): Quote {
    const ranked=rankQuotes(request,quotes,now); if(!ranked[0]) throw new Error("NO_ELIGIBLE_QUOTE"); return ranked[0];
  }

  async execute(input:{
    request:QuoteRequest;
    quotes:Quote[];
    observations:PriceObservation[];
    readings:MeterReading[];
    rail:SettlementRail;
    now?:Date;
  }){
    const now=input.now??new Date();
    const price=evaluatePrice(input.observations,now,this.priceGuard);
    if(this.treasury.policy.requireFreshPrice && price.status!=="FRESH") throw new Error("PRICE_GUARD_BLOCKED");
    const quote=this.selectQuote(input.request,input.quotes,now);
    const maxCost=quote.maxUnits*quote.unitPrice;
    const reservation=this.treasury.reserve({counterparty:quote.provider,asset:quote.asset,amount:maxCost,expiresAt:quote.expiresAt,now});
    this.journal?.append("RESERVATION_AUTHORIZED",{reservationId:reservation.id,counterparty:reservation.counterparty,asset:reservation.asset,reserved:reservation.reserved,quoteId:quote.id},now);
    let lock:{ref:string};
    try{
      lock=await input.rail.reserve({reservation});
      this.journal?.append("RAIL_LOCKED",{reservationId:reservation.id,railId:input.rail.id,railRef:lock.ref},now);
    }catch(error){
      this.treasury.release(reservation.id,now);
      this.journal?.append("RESERVATION_RELEASED",{reservationId:reservation.id,reason:"rail_reserve_failed"},now);
      throw error;
    }
    const actual=settlementAmount(quote,input.readings);
    const plan=planSettlement({reservationId:reservation.id,asset:reservation.asset,reserved:reservation.reserved,actual,policy:this.settlementPolicy});
    this.journal?.append("SETTLEMENT_PLANNED",{reservationId:reservation.id,gross:plan.gross,fee:plan.fee,payout:plan.payout,residual:plan.residual,policy:plan.policy},now);
    try{
      const result=await input.rail.settle({reservation,plan,ref:lock.ref});
      this.journal?.append("RAIL_SETTLED",{reservationId:reservation.id,railId:input.rail.id,railRef:lock.ref,txRef:result.txRef,gross:plan.gross},now);
      this.treasury.markSettlement(reservation.id,plan,now);
      return {quote,reservation,price,plan,rail:{id:input.rail.id,lockRef:lock.ref,txRef:result.txRef}};
    }catch(error){
      try{
        const released=await input.rail.release({reservation,ref:lock.ref});
        this.treasury.release(reservation.id,now);
        this.journal?.append("RESERVATION_RELEASED",{reservationId:reservation.id,railId:input.rail.id,railRef:lock.ref,txRef:released.txRef,reason:"settlement_failed"},now);
      }catch(releaseError){
        this.journal?.append("SETTLEMENT_UNCERTAIN",{reservationId:reservation.id,railId:input.rail.id,railRef:lock.ref,reason:releaseError instanceof Error?releaseError.message:"release_failed"},now);
        throw new Error("SETTLEMENT_FAILED_RELEASE_UNCERTAIN",{cause:error});
      }
      throw error;
    }
  }
}
