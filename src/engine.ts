import type { MeterReading, PriceObservation, Quote, SettlementRail } from "./types.js";
import { evaluatePrice, type PriceGuardConfig } from "./price-guard.js";
import { rankQuotes, type QuoteRequest } from "./quotes.js";
import { Treasury } from "./treasury.js";
import { settlementAmount } from "./metering.js";
import { planSettlement, type SettlementPolicy } from "./settlement.js";

export class EconomicRuntime {
  constructor(
    readonly treasury:Treasury,
    readonly priceGuard:PriceGuardConfig,
    readonly settlementPolicy:SettlementPolicy
  ) {}

  selectQuote(request:QuoteRequest, quotes:Quote[]): Quote {
    const ranked=rankQuotes(request,quotes); if(!ranked[0]) throw new Error("NO_ELIGIBLE_QUOTE"); return ranked[0];
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
    const quote=this.selectQuote(input.request,input.quotes);
    const maxCost=quote.maxUnits*quote.unitPrice;
    const reservation=this.treasury.reserve({counterparty:quote.provider,asset:quote.asset,amount:maxCost,expiresAt:quote.expiresAt,now});
    const lock=await input.rail.reserve({reservation});
    const actual=settlementAmount(quote,input.readings);
    const plan=planSettlement({reservationId:reservation.id,asset:reservation.asset,reserved:reservation.reserved,actual,policy:this.settlementPolicy});
    const result=await input.rail.settle({reservation,plan,ref:lock.ref});
    this.treasury.markSettled(reservation.id,plan.gross,now);
    return {quote,reservation,price,plan,rail:{id:input.rail.id,lockRef:lock.ref,txRef:result.txRef}};
  }
}
