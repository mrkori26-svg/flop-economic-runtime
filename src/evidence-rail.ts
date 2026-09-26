import { createHash } from "node:crypto";
import type { Reservation, SettlementPlan, SettlementRail } from "./types.js";

export type RailObservation = {
  schema: "flop.rail-observation/v1";
  mode: "NO_VALUE" | "TESTNET" | "LIVE";
  railId: string;
  ref: string;
  sequence: number;
  status: "LOCKED" | "SETTLED" | "RELEASED" | "UNKNOWN";
  reservationId: string;
  asset: string;
  amount: string;
  txRef?: string;
  observedAt: string;
  previousDigest: string | null;
  digest: string;
};

type RailState = {
  reservation: Reservation;
  status: "LOCKED" | "SETTLED" | "RELEASED";
  plan?: SettlementPlan;
  txRef?: string;
};function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj).sort().map((key) => `${JSON.stringify(key)}:${canonical(obj[key])}`).join(",")}}`;
}

function digest(value: unknown): string {
  return createHash("sha256").update(canonical(value)).digest("hex");
}

export class NoValueEvidenceRail implements SettlementRail {
  readonly id = "no-value-evidence-rail";
  readonly mode = "NO_VALUE" as const;
  private states = new Map<string, RailState>();
  private observations: RailObservation[] = [];
  private counter = 0;

  private ref(kind: string, reservationId: string): string {
    return `${kind}:${reservationId}:${++this.counter}`;
  }  private record(input: Omit<RailObservation, "schema" | "mode" | "railId" | "sequence" | "previousDigest" | "digest">): RailObservation {
    const previousDigest = this.observations.at(-1)?.digest ?? null;
    const body = {
      schema: "flop.rail-observation/v1" as const,
      mode: this.mode,
      railId: this.id,
      sequence: this.observations.length + 1,
      previousDigest,
      ...input,
    };
    const observation = { ...body, digest: digest(body) };
    this.observations.push(observation);
    return observation;
  }

  async reserve({ reservation }: { reservation: Reservation }): Promise<{ ref: string }> {
    const ref = this.ref("lock", reservation.id);
    this.states.set(ref, { reservation, status: "LOCKED" });
    this.record({
      ref,
      status: "LOCKED",
      reservationId: reservation.id,
      asset: reservation.asset,
      amount: reservation.reserved.toString(),
      observedAt: reservation.createdAt,
    });
    return { ref };
  }  async settle({ reservation, plan, ref }: { reservation: Reservation; plan: SettlementPlan; ref: string }): Promise<{ txRef: string }> {
    const state = this.states.get(ref);
    if (!state || state.status !== "LOCKED" || state.reservation.id !== reservation.id) throw new Error("RAIL_LOCK_MISMATCH");
    const txRef = this.ref("settle", reservation.id);
    state.status = "SETTLED";
    state.plan = plan;
    state.txRef = txRef;
    this.record({
      ref,
      status: "SETTLED",
      reservationId: reservation.id,
      asset: reservation.asset,
      amount: plan.gross.toString(),
      txRef,
      observedAt: reservation.createdAt,
    });
    return { txRef };
  }

  async release({ reservation, ref }: { reservation: Reservation; ref: string }): Promise<{ txRef: string }> {
    const state = this.states.get(ref);
    if (!state || state.status !== "LOCKED" || state.reservation.id !== reservation.id) throw new Error("RAIL_LOCK_MISMATCH");
    const txRef = this.ref("release", reservation.id);
    state.status = "RELEASED";
    state.txRef = txRef;    this.record({
      ref,
      status: "RELEASED",
      reservationId: reservation.id,
      asset: reservation.asset,
      amount: reservation.reserved.toString(),
      txRef,
      observedAt: reservation.createdAt,
    });
    return { txRef };
  }

  async observe(ref: string): Promise<{ status: "LOCKED" | "SETTLED" | "RELEASED" | "UNKNOWN"; amount?: bigint }> {
    const state = this.states.get(ref);
    if (!state) return { status: "UNKNOWN" };
    return { status: state.status, amount: state.plan?.gross ?? state.reservation.reserved };
  }

  evidence(): RailObservation[] {
    return this.observations.map((item) => ({ ...item }));
  }

  verifyChain(): boolean {
    let previous: string | null = null;
    for (let i = 0; i < this.observations.length; i += 1) {
      const current = this.observations[i]!;
      const { digest: actual, ...body } = current;
      if (current.sequence !== i + 1 || current.previousDigest !== previous || digest(body) !== actual) return false;
      previous = actual;
    }
    return true;
  }
}
