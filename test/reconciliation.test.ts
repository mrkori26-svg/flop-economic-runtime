import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EconomicJournal } from "../src/journal.js";
import { recoverTreasuryFromJournal } from "../src/recovery.js";
import { reconcileReservationFromRail } from "../src/reconciliation.js";
import type { SettlementRail } from "../src/types.js";

const policy={maxPerSettlement:1000n,maxDailySpend:5000n,allowedAssets:["FLOP"]};
const at=new Date("2026-09-28T12:00:00Z");

function fixture(){
  const journal=new EconomicJournal(join(mkdtempSync(join(tmpdir(),"economic-reconcile-")),"journal.ndjson"));
  journal.append("RESERVATION_AUTHORIZED",{
    reservationId:"r1",counterparty:"did:p",asset:"FLOP",reserved:200n,
    createdAt:at.toISOString(),expiresAt:"2026-09-29T00:00:00Z"
  },at);
  journal.append("SETTLEMENT_PLANNED",{
    reservationId:"r1",asset:"FLOP",gross:120n,fee:2n,payout:118n,
    residual:80n,policy:"RETURN_RESIDUAL"
  },at);
  journal.append("RAIL_LOCKED",{reservationId:"r1",railId:"rail-x",railRef:"lock-1"},at);
  return {journal,treasury:recoverTreasuryFromJournal(policy,journal).treasury};
}
function observedRail(
  status:"LOCKED"|"SETTLED"|"RELEASED"|"UNKNOWN",
  amount?:bigint
):SettlementRail {
  const unused=async()=>{throw new Error("unused")};
  return {
    id:"rail-x",
    reserve:unused,
    settle:unused,
    release:unused,
    observe:async()=>amount===undefined?{status}:{status,amount}
  };
}

test("reconciliation finalizes independently observed settlement exactly once",async()=>{
  const {journal,treasury}=fixture();
  const result=await reconcileReservationFromRail({
    reservationId:"r1",treasury,journal,rail:observedRail("SETTLED",120n),now:at
  });
  assert.equal(result.status,"SETTLED");
  assert.equal(result.durable,true);
  assert.equal(treasury.reservations.get("r1")?.status,"SETTLED");
  assert.equal(treasury.spentToday(at,"FLOP"),120n);
  assert.deepEqual(journal.unresolvedReservations(),[]);
  const count=journal.read().length;
  const replay=await reconcileReservationFromRail({
    reservationId:"r1",treasury,journal,rail:observedRail("UNKNOWN"),now:at
  });
  assert.equal(replay.status,"SETTLED");
  assert.equal(journal.read().length,count);
});
test("unknown or still-locked rail state remains reserved without journal mutation",async()=>{
  for(const [status,amount] of [["UNKNOWN",undefined],["LOCKED",200n]] as const){
    const {journal,treasury}=fixture();
    const count=journal.read().length;
    const result=await reconcileReservationFromRail({
      reservationId:"r1",treasury,journal,rail:observedRail(status,amount),now:at
    });
    assert.equal(result.status,"PENDING");
    assert.equal(result.durable,false);
    assert.equal(treasury.reservations.get("r1")?.status,"RESERVED");
    assert.equal(journal.read().length,count);
  }
});

test("observed release closes reservation durably",async()=>{
  const {journal,treasury}=fixture();
  const result=await reconcileReservationFromRail({
    reservationId:"r1",treasury,journal,rail:observedRail("RELEASED",200n),now:at
  });
  assert.equal(result.status,"RELEASED");
  assert.equal(treasury.reservations.get("r1")?.status,"RELEASED");
  assert.deepEqual(journal.unresolvedReservations(),[]);
  assert.equal(journal.read().at(-1)?.type,"RESERVATION_RELEASED");
});
test("terminal observation without exact amount fails closed",async()=>{
  for(const rail of [observedRail("SETTLED"),observedRail("SETTLED",121n)]){
    const {journal,treasury}=fixture();
    const count=journal.read().length;
    await assert.rejects(
      reconcileReservationFromRail({reservationId:"r1",treasury,journal,rail,now:at}),
      /RECONCILIATION_AMOUNT_(?:REQUIRED|MISMATCH)/
    );
    assert.equal(treasury.reservations.get("r1")?.status,"RESERVED");
    assert.equal(journal.read().length,count);
  }
});
