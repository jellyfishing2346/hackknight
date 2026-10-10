import type { Bill, Item, Payment } from "./types";

export const round2 = (n: number) => Math.round(n * 100) / 100;
export const money = (n: number) => `$${n.toFixed(2)}`;
const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);

/** Names match regardless of case or stray spaces, so "sam " and "Sam" are one person. */
export const sameName = (a: string | null | undefined, b: string | null | undefined) =>
  !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

export type Person = {
  name: string;
  isHost: boolean;
  /** Their claimed items. */
  items: number;
  /** Their even share of unclaimed items, when the host chose to split leftovers. */
  leftover: number;
  /** Their proportional share of tax and tip. */
  extras: number;
  /** What they owe the host. Always 0 for the host. */
  owed: number;
  /** What has landed on Solana from them. */
  paid: number;
  settled: boolean;
};

export type Split = {
  host: Person;
  guests: Person[];
  /** Host first, then guests in the order they joined. */
  people: Person[];
  total: number;
  /** The host's own part of the bill, which they've already covered. */
  hostShare: number;
  /** Sum of what guests owe the host. */
  owedToHost: number;
  /** Repaid so far (capped at what each guest owes). */
  collected: number;
  toGo: number;
  unclaimedCount: number;
  unclaimedTotal: number;
  splitLeftovers: boolean;
  settled: boolean;
};

/**
 * The whole bill, split. Each person pays for their items plus an even share of any
 * leftovers the host chose to split, and tax and tip in proportion to that. The host
 * paid the restaurant, so they owe nothing and absorb any rounding cent.
 */
export function split(bill: Bill, items: Item[], payments: Payment[]): Split {
  const hostName = bill.host_name;
  const names: string[] = [hostName];
  const add = (n: string | null) => {
    if (n && !names.some((x) => sameName(x, n))) names.push(n);
  };
  items.forEach((i) => add(i.claimed_by));
  payments.forEach((p) => add(p.payer_name));

  const itemsTotal = sum(items.map((i) => i.price));
  const extrasTotal = bill.tax + bill.tip;
  const total = round2(itemsTotal + extrasTotal);
  const unclaimed = items.filter((i) => !i.claimed_by);
  const unclaimedTotal = round2(sum(unclaimed.map((i) => i.price)));
  const splitLeftovers = bill.split_leftovers && unclaimed.length > 0;

  const people: Person[] = names.map((name) => {
    const isHost = sameName(name, hostName);
    const mine = sum(items.filter((i) => sameName(i.claimed_by, name)).map((i) => i.price));
    const leftover = splitLeftovers ? unclaimedTotal / names.length : 0;
    const base = mine + leftover;
    const extras = itemsTotal > 0 ? (base / itemsTotal) * extrasTotal : 0;
    const paid = round2(sum(payments.filter((p) => sameName(p.payer_name, name) && p.status === "paid").map((p) => p.amount)));
    const owed = isHost ? 0 : round2(base + extras);
    return {
      name,
      isHost,
      items: round2(mine),
      leftover: round2(leftover),
      extras: round2(extras),
      owed,
      paid,
      settled: isHost || paid >= owed - 0.005,
    };
  });

  const host = people[0];
  const guests = people.slice(1);
  const owedToHost = round2(sum(guests.map((g) => g.owed)));
  const collected = round2(sum(guests.map((g) => Math.min(g.paid, g.owed))));

  // Whatever isn't owed by guests or still unassigned is the host's own part.
  // This is where any rounding cent lands, so the parts always add up to the total.
  const unassigned = splitLeftovers || itemsTotal === 0 ? 0 : (unclaimedTotal / itemsTotal) * (itemsTotal + extrasTotal);
  const hostShare = round2(total - owedToHost - unassigned);

  const allAssigned = unclaimed.length === 0 || splitLeftovers;
  const settled = allAssigned && guests.length > 0 && guests.every((g) => g.settled);

  return {
    host,
    guests,
    people,
    total,
    hostShare,
    owedToHost,
    collected,
    toGo: round2(owedToHost - collected),
    unclaimedCount: unclaimed.length,
    unclaimedTotal,
    splitLeftovers,
    settled,
  };
}

/** What this person still needs to send the host. */
export function amountLeft(s: Split, name: string) {
  const p = s.people.find((x) => sameName(x.name, name));
  if (!p || p.isHost) return 0;
  return Math.max(0, round2(p.owed - p.paid));
}

export function billTotal(bill: Bill, items: Item[]) {
  return round2(sum(items.map((i) => i.price)) + bill.tax + bill.tip);
}

/** Link to a transaction on Solana's public explorer (devnet). */
export const explorerTx = (signature: string) => `https://explorer.solana.com/tx/${signature}?cluster=devnet`;

/** The most recent confirmed transaction for this person, if any. */
export function latestSignature(name: string, payments: Payment[]): string | null {
  const paid = payments.filter((p) => sameName(p.payer_name, name) && p.status === "paid" && p.signature);
  return paid.length ? paid[paid.length - 1].signature : null;
}
