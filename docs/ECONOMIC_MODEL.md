# Economic model

The runtime deliberately represents two settlement policies because ecosystem specifications are still resolving amount semantics.

## RETURN_RESIDUAL

Reserve maximum `L`, meter actual `A`, require `A <= L`, pay based on `A`, return `L-A`.

This avoids stranded residuals and makes over-reservation economically safe.

## FULL_RESERVED_PAYOUT

Reserve `L` and pay against the full reservation. Metering remains available for admission/accounting but does not reduce gross settlement.

## Fees

`fee = floor(gross * feePpm / 1_000_000)`

`payout = gross - fee`

No implicit fee source exists. A future audit-pool adapter can route `fee` explicitly.

## Over-use

`A > L` is rejected. There is no silent clamp and no automatic unlimited top-up. A caller may explicitly reserve a larger amount in a new economic decision.
