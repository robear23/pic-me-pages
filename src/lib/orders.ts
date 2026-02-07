import { getStoredAccessToken } from "@/contexts/AuthContext";

export type OrderRow = {
  id: string;
  user_id: string;
  book_id: string | null;
  price_paid: number;
  shipping_address: unknown | null;
  created_at: string | null;
  updated_at: string | null;
  order_type: string;
  stripe_payment_id: string | null;
  lulu_order_id: string | null;
  status: string | null;
  lulu_status: string | null;
};

const postgrestInsert = async <T>(table: string, row: unknown): Promise<T> => {
  const accessToken = getStoredAccessToken();
  if (!accessToken) {
    throw new Error("Please sign in to continue.");
  }

  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/rest/v1/${table}?select=*`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Prefer: "return=representation",
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(row),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const msg = err?.message || err?.error || `Request failed with status ${res.status}`;
    throw new Error(msg);
  }

  const data = (await res.json()) as T[];
  if (!Array.isArray(data) || !data[0]) {
    throw new Error("Insert succeeded but returned no data.");
  }
  return data[0];
};

export const createTestOrderForUser = async (userId: string): Promise<OrderRow> => {
  return postgrestInsert<OrderRow>("orders", {
    user_id: userId,
    order_type: "test_mode",
    price_paid: 0,
    status: "test",
  });
};
