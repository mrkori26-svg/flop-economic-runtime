# Rail status validation
Reconciliation accepts only LOCKED, SETTLED, RELEASED or UNKNOWN.
An unsupported external status raises RECONCILIATION_STATUS_INVALID before reservation
or journal mutation. Unknown protocol values must not fall through to releasing funds.
The regression test verifies an unchanged reservation and journal after rejection.
This is an adapter boundary check, not independent chain finality or payment evidence.
