# FLOP Economic Runtime

A fail-closed economic execution layer for autonomous agents.

```text
QUOTE
  ↓
PRICE GUARD
  ↓
TREASURY RESERVE
  ↓
EXECUTE / METER
  ↓
SETTLE
  ↓
RECONCILE
```

The runtime is deliberately separate from proving and transport. It answers a different question: **can an agent safely commit, meter and settle economic work without giving the model unrestricted wallet authority?**

## What it provides

- deterministic RFQ/quote ranking
- multi-source price freshness, quorum and deviation guard
- treasury policy: asset/counterparty/per-settlement/daily limits
- reservation lifecycle
- metered settlement with explicit `A < L`, `A = L`, `A > L` behavior
- explicit fee arithmetic and residual disposition
- settlement rail adapter contract
- append-friendly ledger primitives and reconciliation
- CLI surface for price checking
- zero runtime dependencies

## Install

```bash
npm install @flop-tools/economic-runtime
```

## Minimal use

```ts
import {
  EconomicRuntime,
  Treasury,
  MemoryRail
} from "@flop-tools/economic-runtime";

const treasury = new Treasury({
  maxPerSettlement: 1_000_000n,
  maxDailySpend: 5_000_000n,
  allowedAssets: ["FLOP"],
  requireFreshPrice: true
});

const runtime = new EconomicRuntime(
  treasury,
  { maxAgeMs: 30_000, maxDeviationBps: 50, minFreshSources: 2 },
  { feePpm: 10_000n, residualPolicy: "RETURN_RESIDUAL" }
);
```

## Claim boundaries

This package does **not** claim a live FLOP HTLC RPC exists. `MemoryRail` is a deterministic development rail and moves no real value. Live rails must implement `SettlementRail` and preserve their own signing/key boundary.

A successful process exit is not settlement. A room frame is not money. A fresh quote is not a funded lock. Each transition remains explicit.

## Why this exists

Current ecosystem work has strong coordination and emerging rail bindings, but material gaps remain around stale market references, variable settlement, fee accounting, treasury policy, and safe agent spending. This runtime isolates those concerns behind stable contracts so network-specific rails can be added without rewriting quote, treasury, metering or accounting logic.
