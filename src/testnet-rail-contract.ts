import { createHash } from "node:crypto";

export type TestnetFinality = "CONFIRMED" | "SAFE" | "FINALIZED";

export type TestnetRailObservation = {
  schema: "flop.testnet-rail-observation/v1";
  mode: "TESTNET";
  railId: string;
  network: string;
  chainId: string;
  reservationId: string;
  state: "LOCKED" | "SETTLED";
  lockRef: string;
  txRef: string;
  asset: string;
  amount: string;
  blockRef: string;
  confirmations: number;
  finality: TestnetFinality;
  observedAt: string;
  evidenceDigest: string;
  externalObserver: true;
  observerId: string;
};

export type TestnetSettlementExpectation = {
  reservationId: string;
  asset: string;
  lockedAmount: string;
  settledAmount: string;
  minConfirmations: number;
  allowedNetworks?: string[];
};export type TestnetSettlementVerification = {
  schema: "flop.testnet-settlement-verification/v1";
  status: "VERIFIED" | "UNVERIFIED";
  claimBoundary: "TESTNET_RAIL_OBSERVED_NOT_LIVE_VALUE_SETTLEMENT";
  checks: Record<string, boolean>;
  lock: TestnetRailObservation | null;
  settlement: TestnetRailObservation | null;
};

function validDigest(value:string): boolean {
  return /^[0-9a-f]{64}$/.test(value);
}
function validTime(value:string): boolean {
  return Number.isFinite(Date.parse(value));
}
export function testnetObservationDigest(obs: Omit<TestnetRailObservation, "evidenceDigest">): string {
  const canonical = {
    schema: obs.schema,
    mode: obs.mode,
    railId: obs.railId,
    network: obs.network,
    chainId: obs.chainId,
    reservationId: obs.reservationId,
    state: obs.state,
    lockRef: obs.lockRef,
    txRef: obs.txRef,
    asset: obs.asset,
    amount: obs.amount,
    blockRef: obs.blockRef,
    confirmations: obs.confirmations,
    finality: obs.finality,
    observedAt: obs.observedAt,
    externalObserver: obs.externalObserver,
    observerId: obs.observerId,
  };
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}
function observationBody(obs: TestnetRailObservation): Omit<TestnetRailObservation, "evidenceDigest"> {
  const { evidenceDigest: _ignored, ...body } = obs;
  return body;
}
function validObservation(obs: TestnetRailObservation): boolean {
  return obs.schema==="flop.testnet-rail-observation/v1"
    && obs.mode==="TESTNET"
    && Boolean(obs.railId && obs.network && obs.chainId && obs.reservationId && obs.lockRef && obs.txRef && obs.asset && obs.blockRef && obs.observerId)
    && /^[0-9]+$/.test(obs.amount)
    && Number.isInteger(obs.confirmations)
    && obs.confirmations>=0
    && ["CONFIRMED","SAFE","FINALIZED"].includes(obs.finality)
    && validTime(obs.observedAt)
    && validDigest(obs.evidenceDigest)
    && obs.evidenceDigest===testnetObservationDigest(observationBody(obs))
    && obs.externalObserver===true;
}export function verifyTestnetSettlement(
  observations: TestnetRailObservation[],
  expected: TestnetSettlementExpectation,
): TestnetSettlementVerification {
  const lock=observations.find((item)=>item.state==="LOCKED") ?? null;
  const settlement=observations.find((item)=>item.state==="SETTLED") ?? null;
  const checks={
    exactlyTwoObservations: observations.length===2,
    observationsValid: observations.every(validObservation),
    lockPresent: Boolean(lock),
    settlementPresent: Boolean(settlement),
    reservationBound: Boolean(lock && settlement
      && lock.reservationId===expected.reservationId
      && settlement.reservationId===expected.reservationId),
    railBound: Boolean(lock && settlement && lock.railId===settlement.railId),
    networkBound: Boolean(lock && settlement
      && lock.network===settlement.network
      && lock.chainId===settlement.chainId
      && (!expected.allowedNetworks || expected.allowedNetworks.includes(settlement.network))),
    lockBound: Boolean(lock && settlement && lock.lockRef===settlement.lockRef),
    assetBound: Boolean(lock && settlement
      && lock.asset===expected.asset
      && settlement.asset===expected.asset),
    lockAmountBound: Boolean(lock && lock.amount===expected.lockedAmount),
    settlementAmountBound: Boolean(settlement && settlement.amount===expected.settledAmount),
    amountConserved: Boolean(lock && settlement
      && BigInt(settlement.amount)<=BigInt(lock.amount)),
    lockFinalEnough: Boolean(lock && lock.confirmations>=expected.minConfirmations
      && ["SAFE","FINALIZED"].includes(lock.finality)),
    settlementFinalEnough: Boolean(settlement && settlement.confirmations>=expected.minConfirmations
      && ["SAFE","FINALIZED"].includes(settlement.finality)),
    distinctEvidence: Boolean(lock && settlement
      && lock.evidenceDigest!==settlement.evidenceDigest
      && lock.txRef!==settlement.txRef),
    chronological: Boolean(lock && settlement && Date.parse(lock.observedAt)<=Date.parse(settlement.observedAt)),
  };  return {
    schema:"flop.testnet-settlement-verification/v1",
    status:Object.values(checks).every(Boolean) ? "VERIFIED" : "UNVERIFIED",
    claimBoundary:"TESTNET_RAIL_OBSERVED_NOT_LIVE_VALUE_SETTLEMENT",
    checks,
    lock,
    settlement,
  };
}

export interface TestnetSettlementObserver {
  readonly railId: string;
  readonly network: string;
  readonly chainId: string;
  observeSettlement(input: {
    reservationId: string;
    lockRef: string;
    txRef: string;
    asset: string;
    amount: string;
  }): Promise<TestnetRailObservation[]>;
}
