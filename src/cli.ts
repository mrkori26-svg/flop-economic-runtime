#!/usr/bin/env node
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { evaluatePrice } from "./price-guard.js";
import { rankQuotes } from "./quotes.js";
import { planSettlement } from "./settlement.js";
import { fillObligations, makeOrder, matchLimitOrders } from "./trading.js";
import { EconomicJournal } from "./journal.js";
import type { Quote } from "./types.js";

const [cmd,...args]=process.argv.slice(2);
const flag=(n:string)=>{const i=args.indexOf(n);return i<0?undefined:args[i+1];};
const required=(n:string)=>{const v=flag(n);if(!v)throw new Error("FLAG_REQUIRED_"+n.replace(/^--/,"").toUpperCase());return v;};
const readJson=(p:string)=>JSON.parse(readFileSync(resolve(p),"utf8"));
const json=(v:unknown)=>process.stdout.write(JSON.stringify(v,(_,x)=>typeof x==="bigint"?x.toString():x,2)+"\n");

if(cmd==="price-check"){
  const data=readJson(required("--input"));
  json(evaluatePrice(data.observations,new Date(data.now??Date.now()),data.config));
} else if(cmd==="quote-rank"){
  const data=readJson(required("--input"));
  const quotes:Quote[]=(data.quotes??[]).map((q:any)=>({...q,maxUnits:BigInt(q.maxUnits),unitPrice:BigInt(q.unitPrice)}));
  const request={...data.request,...(data.request?.maxUnitPrice!==undefined?{maxUnitPrice:BigInt(data.request.maxUnitPrice)}:{}),...(data.request?.minUnits!==undefined?{minUnits:BigInt(data.request.minUnits)}:{})};
  json(rankQuotes(request,quotes,new Date(data.now??Date.now())));
} else if(cmd==="settlement-plan"){
  const data=readJson(required("--input"));
  json(planSettlement({reservationId:data.reservationId,asset:data.asset,reserved:BigInt(data.reserved),actual:BigInt(data.actual),policy:{feePpm:BigInt(data.policy.feePpm),residualPolicy:data.policy.residualPolicy}}));
} else if(cmd==="self-check"){
  const now=new Date("2026-09-26T21:00:00Z");
  const price=evaluatePrice([
    {source:"venue-a",price:100,observedAt:"2026-09-26T20:59:58Z"},
    {source:"venue-b",price:100.1,observedAt:"2026-09-26T20:59:59Z"}
  ],now,{maxAgeMs:30000,maxDeviationBps:50,minFreshSources:2});
  const quotes:Quote[]=[
    {id:"q-a",provider:"did:a",service:"inference",asset:"FLOP",unit:"token",comparisonProfile:"flop.inference-token.v1",maxUnits:1000n,unitPrice:3n,expiresAt:"2026-09-26T22:00:00Z",capabilities:["llm"]},
    {id:"q-b",provider:"did:b",service:"inference",asset:"FLOP",unit:"token",comparisonProfile:"other",maxUnits:1000n,unitPrice:1n,expiresAt:"2026-09-26T22:00:00Z",capabilities:["llm"]}
  ];
  const ranked=rankQuotes({service:"inference",asset:"FLOP",unit:"token",comparisonProfile:"flop.inference-token.v1",requiredCapabilities:["llm"]},quotes,now);
  const settlement=planSettlement({reservationId:"self-check",asset:"FLOP",reserved:10000n,actual:6200n,policy:{feePpm:10000n,residualPolicy:"RETURN_RESIDUAL"}});
  const sell=makeOrder({id:"s",owner:"seller",side:"SELL",asset:"FLOP",quoteAsset:"USD",quantity:2n,limitPrice:100n,createdAt:"2026-09-26T20:00:00Z"});
  const buy=makeOrder({id:"b",owner:"buyer",side:"BUY",asset:"FLOP",quoteAsset:"USD",quantity:2n,limitPrice:100n,createdAt:"2026-09-26T20:00:01Z"});
  const fill=matchLimitOrders([buy,sell])[0];
  const obligations=fill ? fillObligations(fill) : null;
  const journal=new EconomicJournal(join(mkdtempSync(join(tmpdir(),"flop-economic-self-check-")),"journal.ndjson"));
  journal.append("RESERVATION_AUTHORIZED",{reservationId:"r1"});
  journal.append("RAIL_LOCKED",{reservationId:"r1",railRef:"lock1"});
  const checks={
    priceFresh:price.status==="FRESH"&&price.freshSources.length===2,
    quoteComparable:ranked.length===1&&ranked[0]?.id==="q-a",
    settlementConservation:settlement.gross+settlement.residual===10000n&&settlement.fee+settlement.payout===settlement.gross,
    tradingFill:obligations?.buyerPays.amount===200n&&obligations.sellerDelivers.amount===2n,
    journalIntegrity:journal.verify()&&journal.unresolvedReservations()[0]==="r1"
  };
  json({status:Object.values(checks).every(Boolean)?"PASS":"FAIL",checks,price,settlement,obligations});
  if(!Object.values(checks).every(Boolean))process.exitCode=1;
} else if(cmd==="init"){
  const dir=resolve(flag("--dir")??"economic-runtime");
  mkdirSync(dir,{recursive:true});
  writeFileSync(resolve(dir,"price-check.json"),JSON.stringify({
    now:"2026-09-26T21:00:00Z",
    config:{maxAgeMs:30000,maxDeviationBps:50,minFreshSources:2},
    observations:[{source:"venue-a",price:100,observedAt:"2026-09-26T20:59:55Z"},{source:"venue-b",price:100.1,observedAt:"2026-09-26T20:59:57Z"}]
  },null,2)+"\n");
  writeFileSync(resolve(dir,"settlement-plan.json"),JSON.stringify({reservationId:"example",asset:"FLOP",reserved:"10000",actual:"6200",policy:{feePpm:"10000",residualPolicy:"RETURN_RESIDUAL"}},null,2)+"\n");
  writeFileSync(resolve(dir,"README.md"),"# Economic Runtime integration\n\nRun flop-economic price-check --input price-check.json and flop-economic settlement-plan --input settlement-plan.json.\n");
  json({created:dir,files:["price-check.json","settlement-plan.json","README.md"]});
} else {
  process.stderr.write("usage: flop-economic price-check|quote-rank|settlement-plan|init [options]\n");
  process.exitCode=2;
}
