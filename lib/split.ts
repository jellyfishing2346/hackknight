import type { Bill, Item, Payment } from "./types";

export const round2 = (n: number) => Math.round(n * 100) / 100;
const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** "$1,054.70": thousands separators and always two decimals. */
export const money = (n: number) => usd.format(n);
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

/** True if this person is one of the item's claimers. */
export const hasClaimed = (item: Item, name: string | null | undefined) => item.claimers.some((c) => sameName(c, name));

/** One person's part of an item: its price divided between everyone who had it. */
export const shareOfItem = (item: Item) => (item.claimers.length ? item.price / item.claimers.length : 0);

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
  /** Unclaimed items plus their share of tax and tip, while nobody has taken them on yet. */
  unassigned: number;
  splitLeftovers: boolean;
  /** Set when the whole bill is split evenly: how many ways, and each person's share. */
  evenSplit: number | null;
  evenShare: number | null;
  settled: boolean;
};

/**
 * The whole bill, split. Each person pays for their items plus an even share of any
 * leftovers the host chose to split, and tax and tip in proportion to that. The host
 * paid upfront, so they owe nothing and absorb any rounding cent.
 */
export function split(bill: Bill, items: Item[], payments: Payment[]): Split {
  const hostName = bill.host_name;
  const names: string[] = [hostName];
  const add = (n: string | null) => {
    if (n && !names.some((x) => sameName(x, n))) names.push(n);
  };
  items.forEach((i) => i.claimers.forEach(add));
  payments.forEach((p) => add(p.payer_name));

  const itemsTotal = sum(items.map((i) => i.price));
  const extrasTotal = bill.tax + bill.tip;
  const total = round2(itemsTotal + extrasTotal);
  const paidBy = (name: string) =>
    round2(sum(payments.filter((p) => sameName(p.payer_name, name) && p.status === "paid").map((p) => p.amount)));

  // Whole bill split evenly N ways, host included. Guests don't pick items.
  const n = bill.even_split && bill.even_split >= 2 ? bill.even_split : null;
  if (n) {
    const per = round2(total / n);
    const people: Person[] = names.map((name) => {
      const isHost = sameName(name, hostName);
      const paid = paidBy(name);
      const owed = isHost ? 0 : per;
      return { name, isHost, items: 0, leftover: 0, extras: 0, owed, paid, settled: isHost || paid >= owed - 0.005 };
    });
    const guests = people.slice(1);
    const owedToHost = round2(per * (n - 1));
    const collected = round2(sum(guests.map((g) => Math.min(g.paid, g.owed))));
    return {
      host: people[0],
      guests,
      people,
      total,
      hostShare: round2(total - owedToHost),
      owedToHost,
      collected,
      toGo: round2(Math.max(0, owedToHost - collected)),
      unclaimedCount: 0,
      unclaimedTotal: 0,
      unassigned: 0,
      splitLeftovers: false,
      evenSplit: n,
      evenShare: per,
      settled: guests.filter((g) => g.paid >= per - 0.005).length >= n - 1,
    };
  }

  // Split by item. Shared items divide evenly between everyone who had them.
  const unclaimed = items.filter((i) => i.claimers.length === 0);
  const unclaimedTotal = round2(sum(unclaimed.map((i) => i.price)));
  const splitLeftovers = bill.split_leftovers && unclaimed.length > 0;

  const people: Person[] = names.map((name) => {
    const isHost = sameName(name, hostName);
    const mine = sum(items.filter((i) => hasClaimed(i, name)).map(shareOfItem));
    const leftover = splitLeftovers ? unclaimedTotal / names.length : 0;
    const base = mine + leftover;
    const extras = itemsTotal > 0 ? (base / itemsTotal) * extrasTotal : 0;
    const paid = paidBy(name);
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
  const unassigned = round2(splitLeftovers || itemsTotal === 0 ? 0 : (unclaimedTotal / itemsTotal) * (itemsTotal + extrasTotal));
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
    unassigned,
    splitLeftovers,
    evenSplit: null,
    evenShare: null,
    settled,
  };
}

/** What this person still needs to send the host. */
export function amountLeft(s: Split, name: string) {
  const p = s.people.find((x) => sameName(x.name, name));
  if (p?.isHost) return 0;
  // Splitting evenly: anyone who joins owes one equal share, even before they appear in the list.
  if (s.evenShare != null) return Math.max(0, round2(s.evenShare - (p?.paid ?? 0)));
  if (!p) return 0;
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
