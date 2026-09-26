import test from "node:test";
import assert from "node:assert/strict";
import { rankQuotes } from "../src/quotes.js";

const baseQuote={id:"q1",provider:"did:p",service:"inference",asset:"FLOP",unit:"token",comparisonProfile:"flop.inference-token.v1",maxUnits:100n,unitPrice:3n,expiresAt:"2026-09-27T00:00:00Z",capabilities:["llm"]};

test("quotes are comparable only under exact unit/profile",()=>{
  const request={service:"inference",asset:"FLOP",unit:"token",comparisonProfile:"flop.inference-token.v1"};
  assert.equal(rankQuotes(request,[baseQuote,{...baseQuote,id:"q2",unit:"1k-token",unitPrice:1n}],new Date("2026-09-26T21:00:00Z")).map(x=>x.id).join(","),"q1");
  assert.equal(rankQuotes(request,[baseQuote,{...baseQuote,id:"q3",comparisonProfile:"other",unitPrice:1n}],new Date("2026-09-26T21:00:00Z")).map(x=>x.id).join(","),"q1");
});

test("quote request without comparison profile fails closed",()=>{
  assert.throws(()=>rankQuotes({service:"inference",asset:"FLOP",unit:"token",comparisonProfile:""} as any,[baseQuote]),/COMPARISON_PROFILE_REQUIRED/);
});
