import type { SupabaseClient } from "@supabase/supabase-js";
import type { CustomerPaymentReceiptValues } from "@/domain/customer-payments";
import type { Database } from "@/lib/supabase/database.types";

export async function recordCustomerPaymentReceipt(
  client: SupabaseClient<Database>,
  values: CustomerPaymentReceiptValues,
) {
  const { data, error } = await client.rpc("record_customer_payment_receipt", {
    p_order_id: values.orderId,
    p_expected_updated_at: values.expectedUpdatedAt,
    p_received_on: values.receivedOn,
    p_reference: values.reference,
    p_idempotency_key: values.submissionKey,
  });
  if (error || !data) throw error ?? new Error("Customer payment receipt returned no identifier.");
  return data;
}
