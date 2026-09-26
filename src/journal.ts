import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";

export type EconomicJournalRecord = {
  seq: number;
  at: string;
  type: string;
  payload: Record<string, unknown>;
  previousHash: string | null;
  hash: string;
};

function normalize(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string,unknown>).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,normalize(v)]));
  }
  return value;
}

function digestBody(record: Omit<EconomicJournalRecord,"hash">): string {
  return createHash("sha256").update(JSON.stringify(normalize(record))).digest("hex");
}

export class EconomicJournal {
  constructor(readonly path: string) {}

  read(): EconomicJournalRecord[] {
    if (!existsSync(this.path)) return [];
    return readFileSync(this.path,"utf8").split(/\r?\n/).filter(Boolean).map(line=>JSON.parse(line) as EconomicJournalRecord);
  }

  verify(): boolean {
    const records=this.read();
    let previous:string|null=null;
    for(let i=0;i<records.length;i++){
      const r=records[i]!;
      if(r.seq!==i+1||r.previousHash!==previous) return false;
      const {hash,...body}=r;
      if(digestBody(body)!==hash) return false;
      previous=hash;
    }
    return true;
  }

  append(type:string,payload:Record<string,unknown>,at=new Date()): EconomicJournalRecord {
    const records=this.read();
    if(records.length && !this.verify()) throw new Error("ECONOMIC_JOURNAL_INTEGRITY_FAILURE");
    const previous=records.at(-1)?.hash??null;
    const body={seq:records.length+1,at:at.toISOString(),type,payload:normalize(payload) as Record<string,unknown>,previousHash:previous};
    const record={...body,hash:digestBody(body)};
    appendFileSync(this.path,JSON.stringify(record)+"\n","utf8");
    return record;
  }

  unresolvedReservations(): string[] {
    const active=new Set<string>();
    for(const r of this.read()){
      const id=typeof r.payload.reservationId==="string"?r.payload.reservationId:null;
      if(!id) continue;
      if(r.type==="RESERVATION_AUTHORIZED"||r.type==="RAIL_LOCKED") active.add(id);
      if(r.type==="RAIL_SETTLED"||r.type==="RESERVATION_RELEASED") active.delete(id);
    }
    return [...active].sort();
  }
}
