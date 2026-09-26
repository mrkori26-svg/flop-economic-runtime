import type { SettlementPlan } from "./types.js";

export type SettlementPolicy = {
  feePpm: bigint;
  residualPolicy: "RETURN_RESIDUAL" | "FULL_RESERVED_PAYOUT";
};

export function planSettlement(input:{reservationId:string; asset:string; reserved:bigint; actual:bigint; policy:SettlementPolicy}): SettlementPlan {
  if(input.reserved<=0n || input.actual<0n) throw new Error("SETTLEMENT_AMOUNT_INVALID");
  if(input.actual>input.reserved) throw new Error("SETTLEMENT_ACTUAL_EXCEEDS_RESERVED");
  if(input.policy.feePpm<0n || input.policy.feePpm>1_000_000n) throw new Error("SETTLEMENT_FEE_INVALID");
  const gross = input.policy.residualPolicy==="FULL_RESERVED_PAYOUT" ? input.reserved : input.actual;
  const fee = gross * input.policy.feePpm / 1_000_000n;
  const payout = gross - fee;
  const residual = input.reserved - gross;
  return {reservationId:input.reservationId,gross,fee,payout,residual,asset:input.asset,policy:input.policy.residualPolicy};
}
