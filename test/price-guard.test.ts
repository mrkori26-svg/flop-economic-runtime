import test from "node:test";
import assert from "node:assert/strict";
import { evaluatePrice } from "../src/price-guard.js";

test("fresh quorum returns median reference",()=>{const now=new Date("2026-09-26T21:00:00Z");const r=evaluatePrice([
{source:"a",price:100,observedAt:"2026-09-26T20:59:50Z"},
{source:"b",price:100.2,observedAt:"2026-09-26T20:59:55Z"},
{source:"c",price:99.9,observedAt:"2026-09-26T20:59:58Z"}],now,{maxAgeMs:30000,maxDeviationBps:50,minFreshSources:2});assert.equal(r.status,"FRESH");assert.ok(r.referencePrice!>99.9&&r.referencePrice!<100.2);});

test("stale market blocks reference",()=>{const r=evaluatePrice([{source:"a",price:100,observedAt:"2026-09-26T20:00:00Z"}],new Date("2026-09-26T21:00:00Z"),{maxAgeMs:30000,maxDeviationBps:50,minFreshSources:1});assert.equal(r.status,"STALE");assert.equal(r.referencePrice,null);});

test("diverged sources fail closed",()=>{const now=new Date("2026-09-26T21:00:00Z");const r=evaluatePrice([
{source:"a",price:100,observedAt:now.toISOString()},
{source:"b",price:120,observedAt:now.toISOString()}
],now,{maxAgeMs:30000,maxDeviationBps:100,minFreshSources:2});assert.equal(r.status,"DIVERGED");});


test("duplicate source cannot satisfy source quorum",()=>{
  const now=new Date("2026-09-26T21:00:00Z");
  const r=evaluatePrice([
    {source:"a",price:100,observedAt:"2026-09-26T20:59:58Z"},
    {source:"a",price:100,observedAt:"2026-09-26T20:59:57Z"}
  ],now,{maxAgeMs:30000,maxDeviationBps:50,minFreshSources:2});
  assert.equal(r.status,"INSUFFICIENT");
});

test("future-dated source beyond skew is rejected",()=>{
  const now=new Date("2026-09-26T21:00:00Z");
  const r=evaluatePrice([
    {source:"a",price:100,observedAt:"2026-09-26T21:01:00Z"},
    {source:"b",price:100,observedAt:"2026-09-26T20:59:59Z"}
  ],now,{maxAgeMs:30000,maxDeviationBps:50,minFreshSources:2,maxFutureSkewMs:1000});
  assert.equal(r.status,"INSUFFICIENT");
  assert.ok(r.rejectedSources.includes("a"));
});

test("same-source conflicting latest observations are rejected",()=>{
  const now=new Date("2026-09-26T21:00:00Z");
  const r=evaluatePrice([
    {source:"a",price:100,observedAt:"2026-09-26T20:59:59Z"},
    {source:"a",price:101,observedAt:"2026-09-26T20:59:59Z"},
    {source:"b",price:100,observedAt:"2026-09-26T20:59:59Z"}
  ],now,{maxAgeMs:30000,maxDeviationBps:50,minFreshSources:2});
  assert.equal(r.status,"INSUFFICIENT");
  assert.ok(r.rejectedSources.includes("a"));
});
