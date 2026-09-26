# Architecture

## Layers

1. **Quote/RFQ** — deterministic eligibility and ranking.
2. **Price Guard** — rejects stale, insufficient or divergent market inputs before funds are reserved.
3. **Treasury** — enforces spending policy before a rail is called.
4. **Reservation** — commits a bounded maximum, never an open-ended spend.
5. **Metering** — converts observable work quantity into actual economic amount.
6. **Settlement** — defines gross, fee, payout and residual explicitly.
7. **Rail** — network/value-specific lock, settle and release.
8. **Ledger/Reconciliation** — local accounting record independent of rail implementation.

## Invariants

- no price quorum => no reservation when price safety is required
- actual settlement may never exceed the reserved maximum
- fee arithmetic is integer-only
- residual disposition is explicit
- counterparty and asset policy are checked before rail invocation
- rail adapters never receive unrestricted wallet secrets from this package
- no room/status message is promoted to value settlement without a rail operation

## Integration with FLOP Tools

```text
Session Router
  → Economic Runtime
      → RuntimeTarget / executor
      → SettlementRail
  → Execution Receipt
  → Conformance / OBSERVE
```

The Session Router chooses *who/what*. Economic Runtime decides *under what price, spend and settlement constraints*. RUN executes. PROVE/OBSERVE remain downstream.
