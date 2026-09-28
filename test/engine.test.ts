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


test("rail reserve rejection keeps treasury reserved pending reconciliation",async()=>{
  const treasury=new Treasury({maxPerSettlement:1000n,maxDailySpend:5000n,allowedAssets:["FLOP"],requireFreshPrice:true});
  const journal=new EconomicJournal(join(mkdtempSync(join(tmpdir(),"econ-engine-")),"journal.ndjson"));
  const runtime=new EconomicRuntime(treasury,{maxAgeMs:30000,maxDeviationBps:100,minFreshSources:2},{feePpm:0n,residualPolicy:"RETURN_RESIDUAL"},journal);
  const rail:any={id:"failing",reserve:async()=>{throw new Error("lock_failed");},settle:async()=>({txRef:"x"}),release:async()=>({txRef:"r"})};
  await assert.rejects(runtime.execute({request:{service:"inference",asset:"FLOP",unit:"token",comparisonProfile:"flop.inference-token.v1"},quotes:[quote],observations:[{source:"a",price:1,observedAt:"2026-09-26T20:59:55Z"},{source:"b",price:1,observedAt:"2026-09-26T20:59:56Z"}],readings:[{quantity:1n,unit:"token",observedAt:"2026-09-26T20:59:57Z"}],rail,now:new Date("2026-09-26T21:00:00Z")}),/RAIL_RESERVE_UNCERTAIN/);
  assert.equal([...treasury.reservations.values()][0]?.status,"RESERVED");
  assert.equal(journal.read().at(-1)?.type,"SETTLEMENT_UNCERTAIN");
  assert.equal(journal.unresolvedReservations().length,1);
});

test("failed settlement remains uncertain without attempting release",async()=>{
  const treasury=new Treasury({maxPerSettlement:1000n,maxDailySpend:5000n,allowedAssets:["FLOP"],requireFreshPrice:true});
  const journal=new EconomicJournal(join(mkdtempSync(join(tmpdir(),"econ-engine-")),"journal.ndjson"));
  const runtime=new EconomicRuntime(treasury,{maxAgeMs:30000,maxDeviationBps:100,minFreshSources:2},{feePpm:0n,residualPolicy:"RETURN_RESIDUAL"},journal);
  const rail:any={id:"uncertain",reserve:async()=>({ref:"lock1"}),settle:async()=>{throw new Error("settle_failed");},release:async()=>{throw new Error("release_failed");}};
  await assert.rejects(runtime.execute({request:{service:"inference",asset:"FLOP",unit:"token",comparisonProfile:"flop.inference-token.v1"},quotes:[quote],observations:[{source:"a",price:1,observedAt:"2026-09-26T20:59:55Z"},{source:"b",price:1,observedAt:"2026-09-26T20:59:56Z"}],readings:[{quantity:1n,unit:"token",observedAt:"2026-09-26T20:59:57Z"}],rail,now:new Date("2026-09-26T21:00:00Z")}),/SETTLEMENT_UNCERTAIN/);
  assert.equal([...treasury.reservations.values()][0]?.status,"RESERVED");
  assert.equal(journal.read().at(-1)?.type,"SETTLEMENT_UNCERTAIN");
  assert.equal(journal.unresolvedReservations().length,1);
});

test("metering unit mismatch fails before treasury or rail side effects",async()=>{
  const treasury=new Treasury({maxPerSettlement:1000n,maxDailySpend:5000n,allowedAssets:["FLOP"],requireFreshPrice:true});
  let reserveCalls=0;
  const rail:any={id:"probe",reserve:async()=>{reserveCalls++;return{ref:"x"};},settle:async()=>({txRef:"x"}),release:async()=>({txRef:"r"})};
  const runtime=new EconomicRuntime(treasury,{maxAgeMs:30000,maxDeviationBps:100,minFreshSources:2},{feePpm:0n,residualPolicy:"RETURN_RESIDUAL"});
  await assert.rejects(runtime.execute({
    request:{service:"inference",asset:"FLOP",unit:"token",comparisonProfile:"flop.inference-token.v1"},
    quotes:[quote],
    observations:[{source:"a",price:1,observedAt:"2026-09-26T20:59:55Z"},{source:"b",price:1,observedAt:"2026-09-26T20:59:56Z"}],
    readings:[{quantity:1n,unit:"second",observedAt:"2026-09-26T20:59:57Z"}],
    rail,now:new Date("2026-09-26T21:00:00Z")
  }),/METERING_UNIT_MISMATCH/);
  assert.equal(reserveCalls,0);
  assert.equal(treasury.reservations.size,0);
});

test("confirmed rail settlement is never released when local finalization fails",async()=>{
  class FailingTreasury extends Treasury {
    override markSettlement(): void { throw new Error("local_ledger_failed"); }
  }
  const treasury=new FailingTreasury({maxPerSettlement:1000n,maxDailySpend:5000n,allowedAssets:["FLOP"],requireFreshPrice:true});
  let releaseCalls=0;
  const rail:any={id:"confirmed",reserve:async()=>({ref:"lock1"}),settle:async()=>({txRef:"tx1"}),release:async()=>{releaseCalls++;return{txRef:"release1"};}};
  const runtime=new EconomicRuntime(treasury,{maxAgeMs:30000,maxDeviationBps:100,minFreshSources:2},{feePpm:0n,residualPolicy:"RETURN_RESIDUAL"});
  await assert.rejects(runtime.execute({
    request:{service:"inference",asset:"FLOP",unit:"token",comparisonProfile:"flop.inference-token.v1"},
    quotes:[quote],
    observations:[{source:"a",price:1,observedAt:"2026-09-26T20:59:55Z"},{source:"b",price:1,observedAt:"2026-09-26T20:59:56Z"}],
    readings:[{quantity:1n,unit:"token",observedAt:"2026-09-26T20:59:57Z"}],
    rail,now:new Date("2026-09-26T21:00:00Z")
  }),/SETTLEMENT_CONFIRMED_LOCAL_FINALIZATION_FAILED/);
  assert.equal(releaseCalls,0);
});


test("execution id blocks duplicate execution before a second rail reserve",async()=>{
  const treasury=new Treasury({maxPerSettlement:1000n,maxDailySpend:5000n,allowedAssets:["FLOP"],requireFreshPrice:true});
  const journal=new EconomicJournal(join(mkdtempSync(join(tmpdir(),"econ-idem-")),"journal.ndjson"));
  let reserveCalls=0;
  const rail:any={id:"idem",reserve:async()=>{reserveCalls++;return{ref:"l"}},settle:async()=>({txRef:"t"}),release:async()=>({txRef:"r"})};
  const runtime=new EconomicRuntime(treasury,{maxAgeMs:30000,maxDeviationBps:100,minFreshSources:2},{feePpm:0n,residualPolicy:"RETURN_RESIDUAL"},journal);
  const input:any={executionId:"exec:engine:0001",request:{service:"inference",asset:"FLOP",unit:"token",comparisonProfile:"flop.inference-token.v1"},quotes:[quote],observations:[{source:"a",price:1,observedAt:"2026-09-26T20:59:55Z"},{source:"b",price:1,observedAt:"2026-09-26T20:59:56Z"}],readings:[{quantity:1n,unit:"token",observedAt:"2026-09-26T20:59:57Z"}],rail,now:new Date("2026-09-26T21:00:00Z")};
  await runtime.execute(input);
  await assert.rejects(runtime.execute(input),/EXECUTION_REPLAY_BLOCKED/);
  assert.equal(reserveCalls,1);
});

test("execution id fails closed without durable journal",async()=>{
  const treasury=new Treasury({maxPerSettlement:1000n,maxDailySpend:5000n,allowedAssets:["FLOP"],requireFreshPrice:true});
  const runtime=new EconomicRuntime(treasury,{maxAgeMs:30000,maxDeviationBps:100,minFreshSources:2},{feePpm:0n,residualPolicy:"RETURN_RESIDUAL"});
  const rail:any={id:"idem",reserve:async()=>({ref:"l"}),settle:async()=>({txRef:"t"}),release:async()=>({txRef:"r"})};
  await assert.rejects(runtime.execute({executionId:"exec:engine:0002",request:{service:"inference",asset:"FLOP",unit:"token",comparisonProfile:"flop.inference-token.v1"},quotes:[quote],observations:[{source:"a",price:1,observedAt:"2026-09-26T20:59:55Z"},{source:"b",price:1,observedAt:"2026-09-26T20:59:56Z"}],readings:[{quantity:1n,unit:"token",observedAt:"2026-09-26T20:59:57Z"}],rail,now:new Date("2026-09-26T21:00:00Z")}),/IDEMPOTENCY_REQUIRES_DURABLE_JOURNAL/);
});
