import test from "node:test";
import assert from "node:assert/strict";
import { EconomicJournal, EconomicRuntime, MemoryRail, Treasury } from "../src/index.js";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const quote={id:"q1",provider:"did:provider",service:"inference",asset:"FLOP",unit:"token",comparisonProfile:"flop.inference-token.v1",maxUnits:100n,unitPrice:2n,expiresAt:"2026-09-27T00:00:00Z",capabilities:["llm"]};

test("end-to-end quote reserve meter settle",async()=>{const treasury=new Treasury({maxPerSettlement:1000n,maxDailySpend:5000n,allowedAssets:["FLOP"],requireFreshPrice:true});const runtime=new EconomicRuntime(treasury,{maxAgeMs:30000,maxDeviationBps:100,minFreshSources:2},{feePpm:10000n,residualPolicy:"RETURN_RESIDUAL"});const result=await runtime.execute({
request:{service:"inference",asset:"FLOP",unit:"token",comparisonProfile:"flop.inference-token.v1",requiredCapabilities:["llm"]},
quotes:[quote],
observations:[{source:"a",price:1,observedAt:"2026-09-26T20:59:55Z"},{source:"b",price:1.001,observedAt:"2026-09-26T20:59:56Z"}],
readings:[{quantity:60n,unit:"token",observedAt:"2026-09-26T20:59:57Z"}],
rail:new MemoryRail(),now:new Date("2026-09-26T21:00:00Z")
});assert.equal(result.plan.gross,120n);assert.equal(result.plan.residual,80n);assert.equal(result.price.status,"FRESH");});

test("stale price prevents reservation and settlement",async()=>{const treasury=new Treasury({maxPerSettlement:1000n,maxDailySpend:5000n,allowedAssets:["FLOP"],requireFreshPrice:true});const runtime=new EconomicRuntime(treasury,{maxAgeMs:1000,maxDeviationBps:100,minFreshSources:1},{feePpm:0n,residualPolicy:"RETURN_RESIDUAL"});await assert.rejects(runtime.execute({request:{service:"inference",asset:"FLOP",unit:"token",comparisonProfile:"flop.inference-token.v1"},quotes:[quote],observations:[{source:"a",price:1,observedAt:"2026-09-26T20:00:00Z"}],readings:[{quantity:1n,unit:"token",observedAt:"2026-09-26T21:00:00Z"}],rail:new MemoryRail(),now:new Date("2026-09-26T21:00:00Z")}),/PRICE_GUARD_BLOCKED/);assert.equal(treasury.reservations.size,0);});


test("rail reserve failure releases treasury reservation and journals release",async()=>{
  const treasury=new Treasury({maxPerSettlement:1000n,maxDailySpend:5000n,allowedAssets:["FLOP"],requireFreshPrice:true});
  const journal=new EconomicJournal(join(mkdtempSync(join(tmpdir(),"econ-engine-")),"journal.ndjson"));
  const runtime=new EconomicRuntime(treasury,{maxAgeMs:30000,maxDeviationBps:100,minFreshSources:2},{feePpm:0n,residualPolicy:"RETURN_RESIDUAL"},journal);
  const rail:any={id:"failing",reserve:async()=>{throw new Error("lock_failed");},settle:async()=>({txRef:"x"}),release:async()=>({txRef:"r"})};
  await assert.rejects(runtime.execute({request:{service:"inference",asset:"FLOP",unit:"token",comparisonProfile:"flop.inference-token.v1"},quotes:[quote],observations:[{source:"a",price:1,observedAt:"2026-09-26T20:59:55Z"},{source:"b",price:1,observedAt:"2026-09-26T20:59:56Z"}],readings:[{quantity:1n,unit:"token",observedAt:"2026-09-26T20:59:57Z"}],rail,now:new Date("2026-09-26T21:00:00Z")}),/lock_failed/);
  assert.equal([...treasury.reservations.values()][0]?.status,"RELEASED");
  assert.equal(journal.read().at(-1)?.type,"RESERVATION_RELEASED");
  assert.deepEqual(journal.unresolvedReservations(),[]);
});

test("failed settlement plus failed release remains explicitly uncertain",async()=>{
  const treasury=new Treasury({maxPerSettlement:1000n,maxDailySpend:5000n,allowedAssets:["FLOP"],requireFreshPrice:true});
  const journal=new EconomicJournal(join(mkdtempSync(join(tmpdir(),"econ-engine-")),"journal.ndjson"));
  const runtime=new EconomicRuntime(treasury,{maxAgeMs:30000,maxDeviationBps:100,minFreshSources:2},{feePpm:0n,residualPolicy:"RETURN_RESIDUAL"},journal);
  const rail:any={id:"uncertain",reserve:async()=>({ref:"lock1"}),settle:async()=>{throw new Error("settle_failed");},release:async()=>{throw new Error("release_failed");}};
  await assert.rejects(runtime.execute({request:{service:"inference",asset:"FLOP",unit:"token",comparisonProfile:"flop.inference-token.v1"},quotes:[quote],observations:[{source:"a",price:1,observedAt:"2026-09-26T20:59:55Z"},{source:"b",price:1,observedAt:"2026-09-26T20:59:56Z"}],readings:[{quantity:1n,unit:"token",observedAt:"2026-09-26T20:59:57Z"}],rail,now:new Date("2026-09-26T21:00:00Z")}),/SETTLEMENT_FAILED_RELEASE_UNCERTAIN/);
  assert.equal([...treasury.reservations.values()][0]?.status,"RESERVED");
  assert.equal(journal.read().at(-1)?.type,"SETTLEMENT_UNCERTAIN");
  assert.equal(journal.unresolvedReservations().length,1);
});
