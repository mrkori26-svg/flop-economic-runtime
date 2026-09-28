import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EconomicJournal, EconomicRuntime, Treasury, recoverTreasuryFromJournal } from "../src/index.js";
for (const phase of ["reserve", "settle"] as const) {
  test(`${phase} timeout after an external effect preserves reservation across restart`, async t => {
    const dir=mkdtempSync(join(tmpdir(),"economic-ambiguity-"));
    t.after(()=>rmSync(dir,{recursive:true,force:true}));
    const policy={maxPerSettlement:100n,maxDailySpend:100n,allowedAssets:["FLOP"],requireFreshPrice:false};
    const treasury=new Treasury(policy);
    const journal=new EconomicJournal(join(dir,"journal.ndjson"));
    const runtime=new EconomicRuntime(treasury,{maxAgeMs:1000,maxDeviationBps:100,minFreshSources:1},{feePpm:0n,residualPolicy:"RETURN_RESIDUAL"},journal);
    let effects=0, releases=0;
    const rail={id:"fixture-no-value",reserve:async()=>{if(phase==="reserve"){effects++;throw new Error("response lost");}return{ref:"fixture-lock"};},settle:async()=>{effects++;throw new Error("response lost");},release:async()=>{releases++;return{txRef:"unrelated-release-ack"};}};
    const now=new Date("2026-09-26T21:00:00Z");
    await assert.rejects(runtime.execute({request:{service:"test",asset:"FLOP",unit:"job",comparisonProfile:"fixture"},quotes:[{id:"q",provider:"fixture",service:"test",asset:"FLOP",unit:"job",comparisonProfile:"fixture",maxUnits:1n,unitPrice:100n,expiresAt:"2026-09-27T00:00:00Z",capabilities:[]}],observations:[],readings:[{quantity:1n,unit:"job",observedAt:now.toISOString()}],rail,now}));
    assert.equal(effects,1);
    assert.equal(releases,0,"an ambiguous result must not trigger another external effect");
    assert.equal([...treasury.reservations.values()][0]?.status,"RESERVED");
    assert.equal(journal.read().at(-1)?.type,"SETTLEMENT_UNCERTAIN");
    const recovered=recoverTreasuryFromJournal(policy,journal);
    assert.equal(recovered.unresolved.length,1);
    assert.throws(()=>recovered.treasury.reserve({counterparty:"fixture",asset:"FLOP",amount:1n,expiresAt:"2026-09-27T00:00:00Z",now}),/TREASURY_DAILY_LIMIT/);
  });
}
