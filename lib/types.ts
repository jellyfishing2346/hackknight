export type Bill = {
  id: string;
  title: string;
  tax: number;
  tip: number;
  /** The friend who paid upfront. Everyone else pays them back. */
  host_name: string;
  /** Where repayments go. Null means the app's default (demo) wallet. */
  host_wallet: string | null;
  /** When true, unclaimed items are split evenly between everyone. */
  split_leftovers: boolean;
  /** When set, the whole bill is split evenly this many ways (host included) instead of by item. */
  even_split: number | null;
  created_at: string;
};

export type Item = {
  id: string;
  bill_id: string;
  name: string;
  price: number;
  /** Everyone who had this item. Its price is split evenly between them. */
  claimers: string[];
  position: number;
};

export type Payment = {
  id: string;
  bill_id: string;
  payer_name: string;
  amount: number;
  reference: string;
  status: "pending" | "paid";
  signature: string | null;
  created_at: string;
};

export type BillState = { bill: Bill; items: Item[]; payments: Payment[] };

export type ParsedReceipt = {
  merchant: string;
  items: { name: string; price: number }[];
  tax: number;
  tip: number;
};
