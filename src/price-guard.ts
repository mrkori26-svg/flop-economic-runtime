import type { PriceDecision, PriceObservation } from "./types.js";

export type PriceGuardConfig = {
  maxAgeMs: number;
  maxDeviationBps: number;
  minFreshSources: number;
};

function median(values: number[]): number {
  const sorted = [...values].sort((a,b)=>a-b);
  const mid = Math.floor(sorted.length/2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid-1]! + sorted[mid]!) / 2;
}

export function evaluatePrice(observations: PriceObservation[], now: Date, cfg: PriceGuardConfig): PriceDecision {
  const fresh = observations.filter(o => Number.isFinite(o.price) && o.price > 0 && now.getTime() - new Date(o.observedAt).getTime() <= cfg.maxAgeMs);
  if (fresh.length < cfg.minFreshSources) {
    return {status: fresh.length ? "INSUFFICIENT" : "STALE", referencePrice: null, freshSources: fresh.map(x=>x.source), rejectedSources: observations.filter(x=>!fresh.includes(x)).map(x=>x.source), reason: "fresh_source_quorum_not_met"};
  }
  const ref = median(fresh.map(x=>x.price));
  const accepted = fresh.filter(x => Math.abs((x.price-ref)/ref)*10_000 <= cfg.maxDeviationBps);
  if (accepted.length < cfg.minFreshSources) {
    return {status:"DIVERGED", referencePrice:null, freshSources:accepted.map(x=>x.source), rejectedSources:observations.filter(x=>!accepted.includes(x)).map(x=>x.source), reason:"source_deviation_exceeded"};
  }
  return {status:"FRESH", referencePrice:median(accepted.map(x=>x.price)), freshSources:accepted.map(x=>x.source), rejectedSources:observations.filter(x=>!accepted.includes(x)).map(x=>x.source)};
}
