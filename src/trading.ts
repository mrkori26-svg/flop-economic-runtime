import type { PriceDecision } from "./types.js";

export type Side = "BUY" | "SELL";
export type LimitOrder = {
  id: string;
  owner: string;
  side: Side;
  asset: string;
  quoteAsset: string;
  quantity: bigint;
  remaining: bigint;
  limitPrice: bigint;
  createdAt: string;
};

export type Fill = {
  buyOrderId: string;
  sellOrderId: string;
  asset: string;
  quoteAsset: string;
  quantity: bigint;
  price: bigint;
  quoteAmount: bigint;
};

export type TradingGuard = {
  maxReferenceDeviationBps: bigint;
};

export function makeOrder(input: Omit<LimitOrder,"remaining">): LimitOrder {
  if(input.quantity<=0n || input.limitPrice<=0n) throw new Error("ORDER_INVALID");
  if(input.asset===input.quoteAsset) throw new Error("ORDER_PAIR_INVALID");
  return {...input,remaining:input.quantity};
}

export function assertOrderAgainstReference(order: LimitOrder, decision: PriceDecision, guard: TradingGuard): void {
  if(decision.status!=="FRESH" || decision.referencePrice===null) throw new Error("TRADING_REFERENCE_UNAVAILABLE");
  const refScaled=BigInt(Math.round(decision.referencePrice*1_000_000));
  const pxScaled=order.limitPrice*1_000_000n;
  const diff=pxScaled>refScaled?pxScaled-refScaled:refScaled-pxScaled;
  const bps=diff*10_000n/refScaled;
  if(bps>guard.maxReferenceDeviationBps) throw new Error("TRADING_PRICE_DEVIATION");
}

export function matchLimitOrders(orders: LimitOrder[]): Fill[] {
  const buys=orders.filter(x=>x.side==="BUY"&&x.remaining>0n).sort((a,b)=>a.limitPrice===b.limitPrice?a.createdAt.localeCompare(b.createdAt):a.limitPrice>b.limitPrice?-1:1);
  const sells=orders.filter(x=>x.side==="SELL"&&x.remaining>0n).sort((a,b)=>a.limitPrice===b.limitPrice?a.createdAt.localeCompare(b.createdAt):a.limitPrice<b.limitPrice?-1:1);
  const fills:Fill[]=[];
  let bi=0,si=0;
  while(bi<buys.length&&si<sells.length){
    const buy=buys[bi]!, sell=sells[si]!;
    if(buy.asset!==sell.asset||buy.quoteAsset!==sell.quoteAsset){throw new Error("ORDERBOOK_PAIR_MIXED");}
    if(buy.limitPrice<sell.limitPrice) break;
    if(buy.owner===sell.owner) throw new Error("SELF_TRADE_BLOCKED");
    const qty=buy.remaining<sell.remaining?buy.remaining:sell.remaining;
    const price=sell.createdAt<=buy.createdAt?sell.limitPrice:buy.limitPrice;
    fills.push({buyOrderId:buy.id,sellOrderId:sell.id,asset:buy.asset,quoteAsset:buy.quoteAsset,quantity:qty,price,quoteAmount:qty*price});
    buy.remaining-=qty;sell.remaining-=qty;
    if(buy.remaining===0n)bi++;
    if(sell.remaining===0n)si++;
  }
  return fills;
}


export function fillObligations(fill: Fill): {
  buyerPays: { asset: string; amount: bigint };
  sellerDelivers: { asset: string; amount: bigint };
} {
  if (fill.quantity <= 0n || fill.price <= 0n || fill.quoteAmount !== fill.quantity * fill.price) throw new Error("FILL_INVALID");
  return {
    buyerPays: { asset: fill.quoteAsset, amount: fill.quoteAmount },
    sellerDelivers: { asset: fill.asset, amount: fill.quantity },
  };
}
