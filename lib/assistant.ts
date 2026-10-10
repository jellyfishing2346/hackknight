import { round2 } from "./split";

/** A bill Tabby AI has pieced together from the conversation. */
export type TabbyDraft = {
  merchant: string;
  items: { name: string; price: number }[];
  tax: number;
  tip: number;
  splitMode: "items" | "even";
  people: number;
  hostName: string;
};

type RawItem = { name?: string; price?: number; quantity?: number };
export type RawDraft = {
  merchant?: string;
  items?: RawItem[];
  tax?: number;
  tip?: number;
  taxPercent?: number;
  tipPercent?: number;
  splitMode?: string;
  people?: number;
  hostName?: string;
};

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/**
 * Turn the model's draft into a clean bill. Quantities become separate lines so two people
 * can each claim one taco, and tax or tip given as a percentage is worked out from the subtotal,
 * so the arithmetic never depends on the model.
 */
export function normalizeDraft(raw: RawDraft | null | undefined): TabbyDraft | null {
  if (!raw) return null;
  const items: { name: string; price: number }[] = [];
  for (const it of raw.items ?? []) {
    const name = (it.name ?? "").trim();
    const total = num(it.price);
    if (!name || total <= 0) continue;
    const q = Math.min(10, Math.max(1, Math.round(num(it.quantity) || 1)));
    if (q === 1) {
      items.push({ name, price: round2(total) });
    } else {
      // Split the line total into q equal lines; the last one takes any leftover cent.
      const each = Math.floor((total / q) * 100) / 100;
      for (let k = 0; k < q; k++) {
        const price = k === q - 1 ? round2(total - each * (q - 1)) : each;
        items.push({ name, price });
      }
    }
  }
  if (items.length === 0) return null;

  const subtotal = items.reduce((s, i) => s + i.price, 0);
  let tax = num(raw.tax);
  let tip = num(raw.tip);
  if (tax <= 0 && num(raw.taxPercent) > 0) tax = (subtotal * num(raw.taxPercent)) / 100;
  if (tip <= 0 && num(raw.tipPercent) > 0) tip = (subtotal * num(raw.tipPercent)) / 100;

  const people = Math.round(num(raw.people));
  const even = raw.splitMode === "even" && people >= 2;
  return {
    merchant: (raw.merchant ?? "").trim() || "Tab",
    items,
    tax: round2(Math.max(0, tax)),
    tip: round2(Math.max(0, tip)),
    splitMode: even ? "even" : "items",
    people: even ? Math.min(50, people) : 0,
    hostName: (raw.hostName ?? "").trim(),
  };
}
