# Contributing

Changes touching money paths should include:

1. an explicit invariant or claim boundary,
2. a control case,
3. at least one hostile/boundary case,
4. deterministic integer arithmetic for monetary values,
5. no embedded wallet secrets or private keys,
6. no promotion of process/coordination success to settlement without a rail operation.

Run `npm run check` before submitting.
