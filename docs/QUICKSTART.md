# 60-second integration

## CLI

```bash
npm install github:retardio73-boop/flop-economic-runtime#v0.1.0
npx flop-economic init --dir .economic
npx flop-economic price-check --input .economic/price-check.json
npx flop-economic settlement-plan --input .economic/settlement-plan.json
```

## GitHub Actions

```yaml
- uses: retardio73-boop/flop-economic-runtime@<immutable-sha>
  with:
    input: .economic/price-check.json
```

The Action fails the job unless the price decision is `FRESH`.

## Library

Use `EconomicRuntime` when the same process needs quote selection, treasury reservation, metering and rail settlement.
