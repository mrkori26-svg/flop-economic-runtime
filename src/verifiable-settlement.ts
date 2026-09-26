import { createHash } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EconomicRuntime } from "./engine.js";
import { EconomicJournal } from "./journal.js";
import { ledgerHash, reconcile } from "./ledger.js";
import { NoValueEvidenceRail } from "./evidence-rail.js";
import { Treasury } from "./treasury.js";
import type { MeterReading, PriceObservation, Quote } from "./types.js";

function normalize(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([a],[b]) => a.localeCompare(b))
      .map(([key,val]) => [key, normalize(val)]));
  }
  return value;
}

function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(normalize(value))).digest("hex");
}export type NoValueSettlementReceipt = {
  schema: "flop.economic-settlement-receipt/v1";
  mode: "NO_VALUE";
  claimBoundary: "NO_VALUE_EXECUTION_VERIFIED_NOT_NETWORK_SETTLEMENT";
  reservationId: string;
  asset: string;
  gross: string;
  fee: string;
  payout: string;
  residual: string;
  railId: string;
  lockRef: string;
  txRef: string;
  observations: ReturnType<NoValueEvidenceRail["evidence"]>;
  ledgerDigest: string;
  journalHead: string | null;
  checks: Record<string, boolean>;
  status: "VERIFIED" | "UNVERIFIED";
  digest: string;
};

export async function runNoValueSettlementEvidence(): Promise<NoValueSettlementReceipt> {
  const now = new Date("2026-09-26T21:00:00Z");
  const journal = new EconomicJournal(join(mkdtempSync(join(tmpdir(), "flop-economic-evidence-")), "journal.ndjson"));
  const treasury = new Treasury({
    maxPerSettlement: 10000n,
    maxDailySpend: 50000n,
    allowedAssets: ["FLOP"],
    allowedCounterparties: ["did:provider:a"],
    requireFreshPrice: true,
  });  const runtime = new EconomicRuntime(
    treasury,
    { maxAgeMs: 30000, maxDeviationBps: 50, minFreshSources: 2 },
    { feePpm: 10000n, residualPolicy: "RETURN_RESIDUAL" },
    journal
  );
  const rail = new NoValueEvidenceRail();
  const quote: Quote = {
    id: "q-evidence",
    provider: "did:provider:a",
    service: "inference",
    asset: "FLOP",
    unit: "token",
    comparisonProfile: "flop.inference-token.v1",
    maxUnits: 1000n,
    unitPrice: 10n,
    expiresAt: "2026-09-26T22:00:00Z",
    capabilities: ["llm"],
  };
  const observations: PriceObservation[] = [
    { source: "venue-a", price: 100, observedAt: "2026-09-26T20:59:58Z" },
    { source: "venue-b", price: 100.1, observedAt: "2026-09-26T20:59:59Z" },
  ];
  const readings: MeterReading[] = [
    { quantity: 620n, unit: "token", observedAt: "2026-09-26T21:00:00Z", evidenceRef: "meter:self-check" },
  ];  const result = await runtime.execute({
    request: {
      service: "inference",
      asset: "FLOP",
      unit: "token",
      comparisonProfile: "flop.inference-token.v1",
      requiredCapabilities: ["llm"],
    },
    quotes: [quote],
    observations,
    readings,
    rail,
    now,
  });

  const railEvidence = rail.evidence();
  const lock = railEvidence.find((item) => item.status === "LOCKED");
  const settled = railEvidence.find((item) => item.status === "SETTLED");
  const reconciliation = reconcile(treasury.ledger);
  const journalRecords = journal.read();
  const checks = {
    priceFresh: result.price.status === "FRESH",
    lockObserved: Boolean(lock && lock.ref === result.rail.lockRef),
    settleObserved: Boolean(settled && settled.ref === result.rail.lockRef && settled.txRef === result.rail.txRef),
    railChainValid: rail.verifyChain(),
    journalChainValid: journal.verify(),
    journalResolved: journal.unresolvedReservations().length === 0,
    ledgerBalanced: reconciliation.balanced,
    conservation: result.plan.gross + result.plan.residual === result.reservation.reserved
      && result.plan.fee + result.plan.payout === result.plan.gross,
  };  const body = {
    schema: "flop.economic-settlement-receipt/v1" as const,
    mode: "NO_VALUE" as const,
    claimBoundary: "NO_VALUE_EXECUTION_VERIFIED_NOT_NETWORK_SETTLEMENT" as const,
    reservationId: result.reservation.id,
    asset: result.plan.asset,
    gross: result.plan.gross.toString(),
    fee: result.plan.fee.toString(),
    payout: result.plan.payout.toString(),
    residual: result.plan.residual.toString(),
    railId: result.rail.id,
    lockRef: result.rail.lockRef,
    txRef: result.rail.txRef,
    observations: railEvidence,
    ledgerDigest: ledgerHash(treasury.ledger),
    journalHead: journalRecords.at(-1)?.hash ?? null,
    checks,
    status: (Object.values(checks).every(Boolean) ? "VERIFIED" : "UNVERIFIED") as "VERIFIED" | "UNVERIFIED",
  };
  return { ...body, digest: digest(body) };
}

export function verifyNoValueSettlementReceipt(receipt: NoValueSettlementReceipt): boolean {
  const { digest: actual, ...body } = receipt;
  if (digest(body) !== actual) return false;
  if (receipt.mode !== "NO_VALUE" || receipt.claimBoundary !== "NO_VALUE_EXECUTION_VERIFIED_NOT_NETWORK_SETTLEMENT") return false;
  if (receipt.status !== "VERIFIED" || !Object.values(receipt.checks).every(Boolean)) return false;
  const lock = receipt.observations.find((item) => item.status === "LOCKED");
  const settled = receipt.observations.find((item) => item.status === "SETTLED");
  return Boolean(lock && settled && lock.ref === receipt.lockRef && settled.ref === receipt.lockRef && settled.txRef === receipt.txRef);
}
