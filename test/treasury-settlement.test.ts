import test from "node:test";
import assert from "node:assert/strict";
import { Treasury } from "../src/treasury.js";
import { planSettlement } from "../src/settlement.js";
import { reconcile } from "../src/ledger.js";

test("treasury enforces per-settlement and daily limits",()=>{const t=new Treasury({maxPerSettlement:1000n,maxDailySpend:1500n,allowedAssets:["FLOP"]});const now=new Date("2026-09-26T10:00:00Z");const a=t.reserve({counterparty:"did:a",asset:"FLOP",amount:900n,expiresAt:"2026-09-27T00:00:00Z",now});t.markSettled(a.id,900n,now);assert.throws(()=>t.reserve({counterparty:"did:b",asset:"FLOP",amount:700n,expiresAt:"2026-09-27T00:00:00Z",now}),/DAILY_LIMIT/);});

test("metered settlement returns residual atomically",()=>{const p=planSettlement({reservationId:"r1",asset:"FLOP",reserved:10000n,actual:6200n,policy:{feePpm:10000n,residualPolicy:"RETURN_RESIDUAL"}});assert.equal(p.gross,6200n);assert.equal(p.fee,62n);assert.equal(p.payout,6138n);assert.equal(p.residual,3800n);});

test("actual above locked max is rejected",()=>{assert.throws(()=>planSettlement({reservationId:"r1",asset:"FLOP",reserved:10000n,actual:10001n,policy:{feePpm:0n,residualPolicy:"RETURN_RESIDUAL"}}),/ACTUAL_EXCEEDS_RESERVED/);});

test("ledger never settles more than reserved",()=>{const t=new Treasury({maxPerSettlement:1000n,maxDailySpend:1000n,allowedAssets:["FLOP"]});const r=t.reserve({counterparty:"did:a",asset:"FLOP",amount:1000n,expiresAt:"2026-09-27T00:00:00Z"});t.markSettled(r.id,700n);assert.equal(reconcile(t.ledger).balanced,true);});
