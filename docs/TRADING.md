# Trading execution

The trading module is intentionally small and deterministic.

It provides:

- limit orders
- price-time priority
- deterministic fills
- self-trade prevention
- reference-price admission guard
- separation between matching and value settlement

A match is **not settlement**. The matching engine produces a `Fill`; a caller must route the economic obligation through treasury/reservation/rail settlement separately.

## Reference guard

Orders can be rejected when the current reference is stale, lacks source quorum, diverges across venues, or the order limit exceeds the configured deviation from the fresh reference.

This is designed specifically to prevent a system from continuing to settle against a silently frozen market reference.

## Non-goals

This package does not provide leverage, margin, liquidation, derivatives or custody. Those require separate risk models and should not be inferred from spot limit-order matching.
