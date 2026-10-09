import type { Bill, Item, Payment } from "./types";

export const round2 = (n: number) => Math.round(n * 100) / 100;
export const money = (n: number) => `$${n.toFixed(2)}`;

/** Each person's share: their items plus a proportional cut of tax and tip. */
export function shareFor(name: string, items: Item[], bill: Pick<Bill, "tax" | "tip">) {
  const itemsTotal = items.reduce((s, i) => s + i.price, 0);
  const mine = items.filter((i) => i.claimed_by === name).reduce((s, i) => s + i.price, 0);
  const extras = itemsTotal > 0 ? (mine / itemsTotal) * (bill.tax + bill.tip) : 0;
  return { subtotal: round2(mine), extras: round2(extras), total: round2(mine + extras) };
}

export type Person = { name: string; owed: number; paid: number; settled: boolean };

/** Everyone who has claimed something or paid, with what they owe and what has landed. */
export function people(bill: Bill, items: Item[], payments: Payment[]): Person[] {
  const names = new Set<string>();
  items.forEach((i) => i.claimed_by && names.add(i.claimed_by));
  payments.forEach((p) => names.add(p.payer_name));
  return [...names].map((name) => {
    const owed = shareFor(name, items, bill).total;
    const paid = round2(
      payments.filter((p) => p.payer_name === name && p.status === "paid").reduce((s, p) => s + p.amount, 0),
    );
    return { name, owed, paid, settled: owed > 0 && paid >= owed - 0.005 };
  });
}

export function billTotal(bill: Bill, items: Item[]) {
  return round2(items.reduce((s, i) => s + i.price, 0) + bill.tax + bill.tip);
}
