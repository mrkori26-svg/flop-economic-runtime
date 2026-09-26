# Threat model

## Protected assets

- treasury spending authority
- settlement reservations
- market reference integrity
- rail references and transaction identifiers
- accounting integrity

## Hostile inputs

The runtime assumes quotes, market observations, meter readings, counterparties and rail responses may be malicious or malformed.

## Controls

- all spending is bounded before rail invocation
- allowed asset/counterparty lists are enforced locally
- stale/insufficient/divergent price inputs fail closed
- actual settlement cannot exceed the reserved maximum
- integer-only accounting avoids floating-point money arithmetic
- self-trading is rejected by the matching engine
- live signing and private keys are outside this package
- a rail adapter must bind the reservation to its own network object
- no coordination status is treated as a balance change
- reconciliation is independent of rail success strings

## Explicitly not protected here

A malicious wallet, compromised signer host, dishonest chain client or consensus failure cannot be made honest by this package. Live adapters must authenticate their upstream and fail closed on uncertain network state.
