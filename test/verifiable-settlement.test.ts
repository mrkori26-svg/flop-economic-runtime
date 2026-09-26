import test from "node:test";
import assert from "node:assert/strict";
import { NoValueEvidenceRail } from "../src/evidence-rail.js";
import { runNoValueSettlementEvidence, verifyNoValueSettlementReceipt } from "../src/verifiable-settlement.js";

test("NO_VALUE settlement produces lock -> settled rail evidence and a verified receipt", async () => {
  const receipt = await runNoValueSettlementEvidence();
  assert.equal(receipt.mode, "NO_VALUE");
  assert.equal(receipt.claimBoundary, "NO_VALUE_EXECUTION_VERIFIED_NOT_NETWORK_SETTLEMENT");
  assert.equal(receipt.status, "VERIFIED");
  assert.equal(receipt.observations.length, 2);
  assert.equal(receipt.observations[0]?.status, "LOCKED");
  assert.equal(receipt.observations[1]?.status, "SETTLED");
  assert.equal(receipt.observations[0]?.ref, receipt.lockRef);
  assert.equal(receipt.observations[1]?.ref, receipt.lockRef);
  assert.equal(receipt.observations[1]?.txRef, receipt.txRef);
  assert.equal(verifyNoValueSettlementReceipt(receipt), true);
});

test("receipt verification fails closed on observation mutation", async () => {
  const receipt = await runNoValueSettlementEvidence();
  const mutated = structuredClone(receipt);
  mutated.observations[1]!.status = "RELEASED";
  assert.equal(verifyNoValueSettlementReceipt(mutated), false);
});

test("NO_VALUE rail observation chain is self-verifying", () => {
  const rail = new NoValueEvidenceRail();
  assert.equal(rail.verifyChain(), true);
});
