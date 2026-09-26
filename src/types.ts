export type AssetAmount = { asset: string; units: bigint };

export type Quote = {
  id: string;
  provider: string;
  service: string;
  asset: string;
  unit: string;
  comparisonProfile: string;
  maxUnits: bigint;
  unitPrice: bigint;
  expiresAt: string;
  capabilities: string[];
  metadata?: Record<string, string | number | boolean | null>;
};

export type PriceObservation = {
  source: string;
  price: number;
  observedAt: string;
  confidence?: number;
};

export type PriceDecision = {
  status: "FRESH" | "STALE" | "DIVERGED" | "INSUFFICIENT";
  referencePrice: number | null;
  freshSources: string[];
  rejectedSources: string[];
  reason?: string;
};

export type TreasuryPolicy = {
  maxPerSettlement: bigint;
  maxDailySpend: bigint;
  allowedAssets: string[];
  allowedCounterparties?: string[];
  requireFreshPrice?: boolean;
};

export type Reservation = {
  id: string;
  counterparty: string;
  asset: string;
  reserved: bigint;
  createdAt: string;
  expiresAt: string;
  status: "RESERVED" | "SETTLED" | "RELEASED";
};

export type MeterReading = {
  quantity: bigint;
  unit: string;
  observedAt: string;
  evidenceRef?: string;
};

export type SettlementPlan = {
  reservationId: string;
  gross: bigint;
  fee: bigint;
  payout: bigint;
  residual: bigint;
  asset: string;
  policy: "RETURN_RESIDUAL" | "FULL_RESERVED_PAYOUT";
};

export type LedgerEntry = {
  id: string;
  at: string;
  type: "RESERVE" | "RELEASE" | "SETTLE" | "FEE" | "PAYOUT" | "RESIDUAL_RETURN";
  asset: string;
  amount: bigint;
  counterparty?: string;
  ref?: string;
};

export interface SettlementRail {
  id: string;
  reserve(input: {reservation: Reservation}): Promise<{ref: string}>;
  settle(input: {reservation: Reservation; plan: SettlementPlan; ref: string}): Promise<{txRef: string}>;
  release(input: {reservation: Reservation; ref: string}): Promise<{txRef: string}>;
  observe?(ref: string): Promise<{status: "LOCKED"|"SETTLED"|"RELEASED"|"UNKNOWN"; amount?: bigint}>;
}
