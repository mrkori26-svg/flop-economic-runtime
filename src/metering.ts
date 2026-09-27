import type { MeterReading, Quote } from "./types.js";

export function settlementAmount(quote: Quote, readings: MeterReading[]): bigint {
  if (!readings.length) throw new Error("METERING_REQUIRED");
  const quantity = readings.reduce((n,r)=> {
    if (r.quantity < 0n) throw new Error("METERING_NEGATIVE");
    if (r.unit !== quote.unit) throw new Error("METERING_UNIT_MISMATCH");
    return n+r.quantity;
  },0n);
  if (quantity > quote.maxUnits) throw new Error("METERING_EXCEEDS_RESERVED_MAX");
  return quantity * quote.unitPrice;
}
