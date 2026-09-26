import test from "node:test";
import assert from "node:assert/strict";
import { verifyTestnetSettlement, type TestnetRailObservation } from "../src/testnet-rail-contract.js";

const base={schema:"flop.testnet-rail-observation/v1" as const,mode:"TESTNET" as const,railId:"adapter:testnet",network:"example-testnet",chainId:"123",reservationId:"r1",lockRef:"lock-1",asset:"FLOP",amount:"6200",blockRef:"block-1",confirmations:12,finality:"FINALIZED" as const,observedAt:"2026-09-26T23:00:00Z",externalObserver:true as const};

function fixture(): TestnetRailObservation[] {
  return [
    {...base,state:"LOCKED",txRef:"tx-lock",evidenceDigest:"11".repeat(32)},
    {...base,state:"SETTLED",txRef:"tx-settle",blockRef:"block-2",observedAt:"2026-09-26T23:01:00Z",evidenceDigest:"22".repeat(32)}
  ];
}

test("testnet contract verifies an externally observed finalized lock -> settlement pair",()=>{
  const result=verifyTestnetSettlement(fixture(),{reservationId:"r1",asset:"FLOP",settledAmount:"6200",minConfirmations:2,allowedNetworks:["example-testnet"]});
  assert.equal(result.status,"VERIFIED");
  assert.equal(result.claimBoundary,"TESTNET_RAIL_OBSERVED_NOT_LIVE_VALUE_SETTLEMENT");
});

test("testnet contract fails closed on amount, finality or binding mutation",()=>{
  const amount=fixture(); amount[1]!.amount="6199";
  assert.equal(verifyTestnetSettlement(amount,{reservationId:"r1",asset:"FLOP",settledAmount:"6200",minConfirmations:2}).status,"UNVERIFIED");
  const finality=fixture(); finality[1]!.finality="CONFIRMED"; finality[1]!.confirmations=1;
  assert.equal(verifyTestnetSettlement(finality,{reservationId:"r1",asset:"FLOP",settledAmount:"6200",minConfirmations:2}).status,"UNVERIFIED");
  const binding=fixture(); binding[1]!.lockRef="other";
  assert.equal(verifyTestnetSettlement(binding,{reservationId:"r1",asset:"FLOP",settledAmount:"6200",minConfirmations:2}).status,"UNVERIFIED");
});
