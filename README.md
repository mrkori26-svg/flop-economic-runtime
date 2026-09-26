# FLOP Economic Runtime

A fail-closed economic execution layer for autonomous agents.

```text
QUOTE
  Ã¢â€ â€œ
PRICE GUARD
  Ã¢â€ â€œ
TREASURY RESERVE
  Ã¢â€ â€œ
EXECUTE / METER
  Ã¢â€ â€œ
SETTLE
  Ã¢â€ â€œ
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
- hash-chained durable economic journal with unresolved-reservation recovery
- CLI surface for price checking
- zero runtime dependencies

## Install

```bash
npm install github:retardio73-boop/flop-economic-runtime#v0.3.0
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

## Differentiators

- **Reserve before execution:** models never receive open-ended wallet authority.
- **Freshness before trading:** stale/divergent reference data can stop economic actions before reservation; source quorum is unique-by-source and future-dated observations fail closed.
- **Comparable quotes only:** asset, unit and comparison profile must match before prices can be ranked.
- **Metered settlement:** reserved maximum and actual settlement are distinct first-class amounts.
- **Explicit residuals and fees:** no stranded balance or implicit audit carve; ledger conservation checks payout + fee + residual against the reservation.
- **Matching is not settlement:** order fills remain separate from value movement.
- **Transport is not money:** room/receipt/process status never upgrades itself to a balance change.
- **Rail-neutral:** FLOP HTLC, EVM, channels, exchange settlement and test ledgers can share the same economic policy layer.
- **Zero runtime dependencies:** small surface for agents and CI.

## Claim boundaries

This package does **not** claim a live FLOP HTLC RPC exists. `MemoryRail` is a deterministic development rail and moves no real value. Live rails must implement `SettlementRail` and preserve their own signing/key boundary.

A successful process exit is not settlement. A room frame is not money. A fresh quote is not a funded lock. Each transition remains explicit.

## Why this exists

Current ecosystem work has strong coordination and emerging rail bindings, but material gaps remain around stale market references, variable settlement, fee accounting, treasury policy, and safe agent spending. This runtime isolates those concerns behind stable contracts so network-specific rails can be added without rewriting quote, treasury, metering or accounting logic.


