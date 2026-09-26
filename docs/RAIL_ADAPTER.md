# SettlementRail adapter

Implement four narrow operations:

```ts
interface SettlementRail {
  id: string;
  reserve({ reservation }): Promise<{ ref: string }>;
  settle({ reservation, plan, ref }): Promise<{ txRef: string }>;
  release({ reservation, ref }): Promise<{ txRef: string }>;
  observe?(ref): Promise<{ status: "LOCKED"|"SETTLED"|"RELEASED"|"UNKNOWN"; amount?: bigint }>;
}
```

Rules for a live adapter:

- signing stays outside the runtime and outside model prompts
- bind counterparty, asset and amount to the rail object
- reject any plan whose gross exceeds the reserved amount
- retain immutable rail/tx refs
- fail closed on stale heads, unavailable RPC, malformed responses or identity mismatch
- never map a coordination frame directly to `SETTLED`

Potential adapters: FLOP HTLC, EVM HTLC, payment channels, exchange/matching settlement or custodial testnet ledgers.
