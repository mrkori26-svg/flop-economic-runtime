import type { PriceDecision, PriceObservation } from "./types.js";

export type PriceGuardConfig = {
  maxAgeMs: number;
  maxDeviationBps: number;
  minFreshSources: number;
  maxFutureSkewMs?: number;
};

function median(values: number[]): number {
  const sorted = [...values].sort((a,b)=>a-b);
  const mid = Math.floor(sorted.length/2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid-1]! + sorted[mid]!) / 2;
}

export function evaluatePrice(observations: PriceObservation[], now: Date, cfg: PriceGuardConfig): PriceDecision {
  const nowMs = now.getTime();
  const maxFutureSkewMs = cfg.maxFutureSkewMs ?? 1_000;
  if (!Number.isFinite(nowMs)) throw new Error("PRICE_GUARD_NOW_INVALID");
  if (!Number.isFinite(cfg.maxAgeMs) || cfg.maxAgeMs < 0) throw new Error("PRICE_GUARD_MAX_AGE_INVALID");
  if (!Number.isFinite(cfg.maxDeviationBps) || cfg.maxDeviationBps < 0) throw new Error("PRICE_GUARD_DEVIATION_INVALID");
  if (!Number.isInteger(cfg.minFreshSources) || cfg.minFreshSources < 1) throw new Error("PRICE_GUARD_QUORUM_INVALID");
  if (!Number.isFinite(maxFutureSkewMs) || maxFutureSkewMs < 0) throw new Error("PRICE_GUARD_FUTURE_SKEW_INVALID");

  const bySource = new Map<string, PriceObservation[]>();
  for (const observation of observations) {
    if (!observation.source) continue;
    const list = bySource.get(observation.source) ?? [];
    list.push(observation);
    bySource.set(observation.source, list);
  }

  const candidates: PriceObservation[] = [];
  const rejected = new Set<string>();
  for (const [source, list] of bySource) {
    const parsed = list.map(item => ({ item, ms: Date.parse(item.observedAt) }))
      .filter(x => Number.isFinite(x.ms) && Number.isFinite(x.item.price) && x.item.price > 0)
      .sort((a,b) => b.ms - a.ms);

    if (!parsed.length) { rejected.add(source); continue; }
    const newestMs = parsed[0]!.ms;
    const newest = parsed.filter(x => x.ms === newestMs);
    if (new Set(newest.map(x => x.item.price)).size > 1) { rejected.add(source); continue; }

    const selected = newest[0]!;
    const age = nowMs - selected.ms;
    if (age < -maxFutureSkewMs || age > cfg.maxAgeMs) { rejected.add(source); continue; }
    candidates.push(selected.item);
  }

  if (candidates.length < cfg.minFreshSources) {
    return {
      status: candidates.length ? "INSUFFICIENT" : "STALE",
      referencePrice: null,
      freshSources: candidates.map(x=>x.source),
      rejectedSources: [...new Set([...rejected, ...observations.map(x=>x.source).filter(x=>!candidates.some(y=>y.source===x))])].sort(),
      reason: "fresh_unique_source_quorum_not_met"
    };
  }

  const ref = median(candidates.map(x=>x.price));
  const accepted = candidates.filter(x => Math.abs((x.price-ref)/ref)*10_000 <= cfg.maxDeviationBps);
  if (accepted.length < cfg.minFreshSources) {
    return {
      status:"DIVERGED",
      referencePrice:null,
      freshSources:accepted.map(x=>x.source),
      rejectedSources:[...new Set([...rejected, ...candidates.filter(x=>!accepted.includes(x)).map(x=>x.source)])].sort(),
      reason:"source_deviation_exceeded"
    };
  }

  return {
    status:"FRESH",
    referencePrice:median(accepted.map(x=>x.price)),
    freshSources:accepted.map(x=>x.source),
    rejectedSources:[...new Set([...rejected, ...candidates.filter(x=>!accepted.includes(x)).map(x=>x.source)])].sort()
  };
}
