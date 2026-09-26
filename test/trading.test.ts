import test from "node:test";
import assert from "node:assert/strict";
import { assertOrderAgainstReference, makeOrder, matchLimitOrders } from "../src/trading.js";

test("price-time matching produces deterministic fill",()=>{
  const sell=makeOrder({id:"s1",owner:"seller",side:"SELL",asset:"FLOP",quoteAsset:"USD",quantity:10n,limitPrice:100n,createdAt:"2026-09-26T20:00:00Z"});
  const buy=makeOrder({id:"b1",owner:"buyer",side:"BUY",asset:"FLOP",quoteAsset:"USD",quantity:6n,limitPrice:105n,createdAt:"2026-09-26T20:00:01Z"});
  const fills=matchLimitOrders([buy,sell]);
  assert.equal(fills.length,1);assert.equal(fills[0]!.quantity,6n);assert.equal(fills[0]!.price,100n);assert.equal(fills[0]!.quoteAmount,600n);
});

test("self trade is blocked",()=>{
  const a=makeOrder({id:"s",owner:"same",side:"SELL",asset:"FLOP",quoteAsset:"USD",quantity:1n,limitPrice:100n,createdAt:"2026-09-26T20:00:00Z"});
  const b=makeOrder({id:"b",owner:"same",side:"BUY",asset:"FLOP",quoteAsset:"USD",quantity:1n,limitPrice:100n,createdAt:"2026-09-26T20:00:01Z"});
  assert.throws(()=>matchLimitOrders([a,b]),/SELF_TRADE_BLOCKED/);
});

test("stale reference cannot admit an order",()=>{
  const o=makeOrder({id:"b",owner:"x",side:"BUY",asset:"FLOP",quoteAsset:"USD",quantity:1n,limitPrice:100n,createdAt:"2026-09-26T20:00:00Z"});
  assert.throws(()=>assertOrderAgainstReference(o,{status:"STALE",referencePrice:null,freshSources:[],rejectedSources:["a"]},{maxReferenceDeviationBps:100n}),/REFERENCE_UNAVAILABLE/);
});

test("order too far from reference is blocked",()=>{
  const o=makeOrder({id:"b",owner:"x",side:"BUY",asset:"FLOP",quoteAsset:"USD",quantity:1n,limitPrice:120n,createdAt:"2026-09-26T20:00:00Z"});
  assert.throws(()=>assertOrderAgainstReference(o,{status:"FRESH",referencePrice:100,freshSources:["a","b"],rejectedSources:[]},{maxReferenceDeviationBps:500n}),/PRICE_DEVIATION/);
});
