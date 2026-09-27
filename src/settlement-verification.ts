import { createHash } from "node:crypto";
import { verifyNoValueSettlementReceipt, type NoValueSettlementReceipt } from "./verifiable-settlement.js";
import { verifyTestnetSettlement, type TestnetRailObservation, type TestnetSettlementExpectation } from "./testnet-rail-contract.js";

export type SettlementVerificationEnvelope = {
  schema: "flop.economic-settlement-verification/v1";
  mode: "NO_VALUE" | "TESTNET";
  reservationId: string;
  executionDigest: string;
  railDigest: string;
  receiptDigest: string;
  status: "VERIFIED" | "UNVERIFIED";
  claimBoundary:
    | "NO_VALUE_EXECUTION_VERIFIED_NOT_NETWORK_SETTLEMENT"
    | "TESTNET_RAIL_OBSERVED_NOT_LIVE_VALUE_SETTLEMENT";
  checks: Record<string, boolean>;
  digest: string;
};

function stable(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj).sort().map(k => `${JSON.stringify(k)}:${stable(obj[k])}`).join(",")}}`;
}

function sha(value: unknown): string {
  return createHash("sha256").update(stable(value)).digest("hex");
}
export function verifyNoValueSettlementEnvelope(
  receipt: NoValueSettlementReceipt,
  executionEvidence: unknown,
): SettlementVerificationEnvelope {
  const checks = {
    receiptValid: verifyNoValueSettlementReceipt(receipt),
    reservationBound: Boolean(receipt.reservationId),
    executionBound: Boolean(executionEvidence),
    railBound: Boolean(receipt.railId && receipt.lockRef && receipt.txRef),
  };
  const body = {
    schema: "flop.economic-settlement-verification/v1" as const,
    mode: "NO_VALUE" as const,
    reservationId: receipt.reservationId,
    executionDigest: sha(executionEvidence),
    railDigest: sha(receipt.observations),
    receiptDigest: receipt.digest,
    status: (Object.values(checks).every(Boolean) ? "VERIFIED" : "UNVERIFIED") as "VERIFIED" | "UNVERIFIED",
    claimBoundary: "NO_VALUE_EXECUTION_VERIFIED_NOT_NETWORK_SETTLEMENT" as const,
    checks,
  };
  return { ...body, digest: sha(body) };
}

export function verifyTestnetSettlementEnvelope(
  observations: TestnetRailObservation[],
  expected: TestnetSettlementExpectation,
  executionEvidence: unknown,
): SettlementVerificationEnvelope {
  const rail = verifyTestnetSettlement(observations, expected);
  const checks = {
    railVerified: rail.status === "VERIFIED",
    reservationBound: Boolean(rail.lock && rail.settlement && rail.lock.reservationId === expected.reservationId),
    executionBound: Boolean(executionEvidence),
    distinctRailEvidence: Boolean(rail.lock && rail.settlement && rail.lock.evidenceDigest !== rail.settlement.evidenceDigest),
  };
  const body = {
    schema: "flop.economic-settlement-verification/v1" as const,
    mode: "TESTNET" as const,
    reservationId: expected.reservationId,
    executionDigest: sha(executionEvidence),
    railDigest: sha(observations),
    receiptDigest: sha(rail),
    status: (Object.values(checks).every(Boolean) ? "VERIFIED" : "UNVERIFIED") as "VERIFIED" | "UNVERIFIED",
    claimBoundary: "TESTNET_RAIL_OBSERVED_NOT_LIVE_VALUE_SETTLEMENT" as const,
    checks,
  };
  return { ...body, digest: sha(body) };
}
