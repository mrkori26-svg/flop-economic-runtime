import test from "node:test";
import assert from "node:assert/strict";
import { runNoValueSettlementEvidence } from "../src/verifiable-settlement.js";
import { testnetObservationDigest, type TestnetRailObservation } from "../src/testnet-rail-contract.js";
import { verifyNoValueSettlementEnvelope, verifyTestnetSettlementEnvelope } from "../src/settlement-verification.js";

test("NO_VALUE envelope binds execution, rail and receipt without claiming network settlement", async () => {
  const receipt = await runNoValueSettlementEvidence();
  const execution = { runtime: "economic", reservationId: receipt.reservationId, result: "PASS" };
  const verified = verifyNoValueSettlementEnvelope(receipt, execution);
  assert.equal(verified.status, "VERIFIED");
  assert.equal(verified.claimBoundary, "NO_VALUE_EXECUTION_VERIFIED_NOT_NETWORK_SETTLEMENT");
  assert.match(verified.digest, /^[0-9a-f]{64}$/);
});

function observation(state:"LOCKED"|"SETTLED", txRef:string, blockRef:string, observedAt:string): TestnetRailObservation {
  const body = {
    schema:"flop.testnet-rail-observation/v1" as const,
    mode:"TESTNET" as const,
    railId:"adapter:testnet",
    network:"example-testnet",
    chainId:"123",
    reservationId:"r1",
    state,
    lockRef:"lock-1",
    txRef,
    asset:"FLOP",
    amount:"6200",
    blockRef,
    confirmations:12,
    finality:"FINALIZED" as const,
    observedAt,
    externalObserver:true as const,
    observerId:"observer:testnet-a",
  };
  return {...body,evidenceDigest:testnetObservationDigest(body)};
}

test("TESTNET envelope requires externally observed finalized rail evidence", () => {
  const observations = [
    observation("LOCKED","tx-lock","block-1","2026-09-26T23:00:00Z"),
    observation("SETTLED","tx-settle","block-2","2026-09-26T23:01:00Z"),
  ];
  const execution = { runtime:"economic", reservationId:"r1", result:"PASS" };
  const verified = verifyTestnetSettlementEnvelope(observations,{
    reservationId:"r1", asset:"FLOP", lockedAmount:"6200", settledAmount:"6200",
    minConfirmations:2, allowedNetworks:["example-testnet"],
  },execution);
  assert.equal(verified.status,"VERIFIED");
  assert.equal(verified.claimBoundary,"TESTNET_RAIL_OBSERVED_NOT_LIVE_VALUE_SETTLEMENT");

  observations[1] = {...observations[1]!, lockRef:"other"};
  const rejected = verifyTestnetSettlementEnvelope(observations,{
    reservationId:"r1", asset:"FLOP", lockedAmount:"6200", settledAmount:"6200", minConfirmations:2,
  },execution);
  assert.equal(rejected.status,"UNVERIFIED");
});
