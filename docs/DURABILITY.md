# Durability and recovery

The Economic Runtime can persist an append-only, hash-chained journal.

Recommended event sequence:

```text
RESERVATION_AUTHORIZED
→ RAIL_LOCKED
→ SETTLEMENT_PLANNED
→ RAIL_SETTLED
```

Failure paths are explicit:

```text
rail reserve fails
→ RESERVATION_RELEASED

settlement fails
→ rail release succeeds
→ RESERVATION_RELEASED

settlement fails
→ rail release also fails
→ SETTLEMENT_UNCERTAIN
```

`SETTLEMENT_UNCERTAIN` is intentionally not auto-resolved. The reservation remains active and appears in `unresolvedReservations()` until a caller reconciles the rail/network state.

The journal verifies sequence numbers, `previousHash`, and every record hash before appending new state. A tampered journal fails closed with `ECONOMIC_JOURNAL_INTEGRITY_FAILURE`.

This journal is local economic state. It does not replace authoritative chain or rail state.
