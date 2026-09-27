import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EconomicJournal } from "../src/journal.js";
import { recoverTreasuryFromJournal } from "../src/recovery.js";

const policy={maxPerSettlement:1000n,maxDailySpend:5000n,allowedAssets:["FLOP"]};

function journal(){
  return new EconomicJournal(join(mkdtempSync(join(tmpdir(),"economic-recovery-")),"journal.ndjson"));
}

test("recovery rebuilds settled accounting and daily spend",()=>{
  const j=journal();
  const at=new Date("2026-09-27T12:00:00Z");
  j.append("RESERVATION_AUTHORIZED",{reservationId:"r1",counterparty:"did:p",asset:"FLOP",reserved:200n,createdAt:at.toISOString(),expiresAt:"2026-09-28T00:00:00Z"},at);
  j.append("SETTLEMENT_PLANNED",{reservationId:"r1",asset:"FLOP",gross:120n,fee:2n,payout:118n,residual:80n,policy:"RETURN_RESIDUAL"},at);
  j.append("RAIL_LOCKED",{reservationId:"r1",railId:"x",railRef:"l1"},at);
  j.append("RAIL_SETTLED",{reservationId:"r1",railId:"x",railRef:"l1",txRef:"t1",gross:120n},at);
  const recovered=recoverTreasuryFromJournal(policy,j);
  assert.equal(recovered.treasury.reservations.get("r1")?.status,"SETTLED");
  assert.equal(recovered.treasury.spentToday(at,"FLOP"),120n);
  assert.deepEqual(recovered.unresolved,[]);
});


test("recovery keeps externally ambiguous lock reserved",()=>{
  const j=journal();
  const at=new Date("2026-09-27T12:00:00Z");
  j.append("RESERVATION_AUTHORIZED",{reservationId:"r2",counterparty:"did:p",asset:"FLOP",reserved:200n,createdAt:at.toISOString(),expiresAt:"2026-09-28T00:00:00Z"},at);
  j.append("SETTLEMENT_PLANNED",{reservationId:"r2",asset:"FLOP",gross:120n,fee:0n,payout:120n,residual:80n,policy:"RETURN_RESIDUAL"},at);
  j.append("RAIL_LOCKED",{reservationId:"r2",railId:"x",railRef:"l2"},at);
  j.append("SETTLEMENT_UNCERTAIN",{reservationId:"r2",railId:"x",railRef:"l2",reason:"network"},at);
  const recovered=recoverTreasuryFromJournal(policy,j);
  assert.equal(recovered.treasury.reservations.get("r2")?.status,"RESERVED");
  assert.deepEqual(recovered.unresolved,["r2"]);
});

test("recovery rejects tampered journals",()=>{
  const j=journal();
  j.append("RESERVATION_AUTHORIZED",{reservationId:"r3",counterparty:"did:p",asset:"FLOP",reserved:100n,expiresAt:"2026-09-28T00:00:00Z"});
  const rows=readFileSync(j.path,"utf8").trim().split(/\r?\n/);
  const row=JSON.parse(rows[0]!); row.payload.reserved="101"; rows[0]=JSON.stringify(row);
  writeFileSync(j.path,rows.join("\n")+"\n");
  assert.throws(()=>recoverTreasuryFromJournal(policy,j),/INTEGRITY_FAILURE/);
});
