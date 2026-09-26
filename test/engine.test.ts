import test from "node:test";
import assert from "node:assert/strict";
import { EconomicRuntime, MemoryRail, Treasury } from "../src/index.js";

const quote={id:"q1",provider:"did:provider",service:"inference",asset:"FLOP",maxUnits:100n,unitPrice:2n,expiresAt:"2026-09-27T00:00:00Z",capabilities:["llm"]};

test("end-to-end quote reserve meter settle",async()=>{const treasury=new Treasury({maxPerSettlement:1000n,maxDailySpend:5000n,allowedAssets:["FLOP"],requireFreshPrice:true});const runtime=new EconomicRuntime(treasury,{maxAgeMs:30000,maxDeviationBps:100,minFreshSources:2},{feePpm:10000n,residualPolicy:"RETURN_RESIDUAL"});const result=await runtime.execute({
request:{service:"inference",asset:"FLOP",requiredCapabilities:["llm"]},
quotes:[quote],
observations:[{source:"a",price:1,observedAt:"2026-09-26T20:59:55Z"},{source:"b",price:1.001,observedAt:"2026-09-26T20:59:56Z"}],
readings:[{quantity:60n,unit:"token",observedAt:"2026-09-26T20:59:57Z"}],
rail:new MemoryRail(),now:new Date("2026-09-26T21:00:00Z")
});assert.equal(result.plan.gross,120n);assert.equal(result.plan.residual,80n);assert.equal(result.price.status,"FRESH");});

test("stale price prevents reservation and settlement",async()=>{const treasury=new Treasury({maxPerSettlement:1000n,maxDailySpend:5000n,allowedAssets:["FLOP"],requireFreshPrice:true});const runtime=new EconomicRuntime(treasury,{maxAgeMs:1000,maxDeviationBps:100,minFreshSources:1},{feePpm:0n,residualPolicy:"RETURN_RESIDUAL"});await assert.rejects(runtime.execute({request:{service:"inference"},quotes:[quote],observations:[{source:"a",price:1,observedAt:"2026-09-26T20:00:00Z"}],readings:[{quantity:1n,unit:"token",observedAt:"2026-09-26T21:00:00Z"}],rail:new MemoryRail(),now:new Date("2026-09-26T21:00:00Z")}),/PRICE_GUARD_BLOCKED/);assert.equal(treasury.reservations.size,0);});
