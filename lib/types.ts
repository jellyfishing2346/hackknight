export type Bill = {
  id: string;
  title: string;
  tax: number;
  tip: number;
  /** The friend who paid the restaurant. Everyone else pays them back. */
  host_name: string;
  /** Where repayments go. Null means the app's default (demo) wallet. */
  host_wallet: string | null;
  /** When true, unclaimed items are split evenly between everyone. */
  split_leftovers: boolean;
  created_at: string;
};

export type Item = {
  id: string;
  bill_id: string;
  name: string;
  price: number;
  claimed_by: string | null;
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
