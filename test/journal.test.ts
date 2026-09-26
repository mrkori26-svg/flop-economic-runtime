import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EconomicJournal } from "../src/journal.js";

test("economic journal is hash chained and detects tampering",()=>{
  const root=mkdtempSync(join(tmpdir(),"flop-economic-journal-"));
  const path=join(root,"journal.ndjson");
  const j=new EconomicJournal(path);
  j.append("RESERVATION_AUTHORIZED",{reservationId:"r1",amount:100n},new Date("2026-09-26T21:00:00Z"));
  j.append("RAIL_LOCKED",{reservationId:"r1",railRef:"lock1"},new Date("2026-09-26T21:00:01Z"));
  assert.equal(j.verify(),true);
  assert.deepEqual(j.unresolvedReservations(),["r1"]);
  const rows=readFileSync(path,"utf8").trim().split(/\r?\n/);
  const first=JSON.parse(rows[0]!); first.payload.amount="101"; rows[0]=JSON.stringify(first);
  writeFileSync(path,rows.join("\n")+"\n");
  assert.equal(j.verify(),false);
  assert.throws(()=>j.append("X",{}),/INTEGRITY_FAILURE/);
});

test("settled reservation is no longer unresolved",()=>{
  const root=mkdtempSync(join(tmpdir(),"flop-economic-journal-"));
  const j=new EconomicJournal(join(root,"journal.ndjson"));
  j.append("RESERVATION_AUTHORIZED",{reservationId:"r1"});
  j.append("RAIL_LOCKED",{reservationId:"r1"});
  j.append("RAIL_SETTLED",{reservationId:"r1"});
  assert.deepEqual(j.unresolvedReservations(),[]);
});
