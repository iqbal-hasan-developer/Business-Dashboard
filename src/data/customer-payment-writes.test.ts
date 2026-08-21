import { describe, expect, it, vi } from "vitest";
import { recordCustomerPaymentReceipt } from "@/data/customer-payment-writes";

describe("customer payment receipt RPC repository", () => {
  it("sends evidence only and never sends a browser-provided amount or account", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: "00000000-0000-4000-8000-000000000091", error: null });
    const client = { rpc } as unknown as Parameters<typeof recordCustomerPaymentReceipt>[0];
    const values = {
      orderId: "00000000-0000-4000-8000-000000000001",
      expectedUpdatedAt: "2026-08-17T10:00:00+00:00",
      receivedOn: "2026-08-10",
      reference: "BKASH-TX-1",
      submissionKey: "00000000-0000-4000-8000-000000000002",
    };
    await expect(recordCustomerPaymentReceipt(client, values)).resolves.toBe("00000000-0000-4000-8000-000000000091");
    expect(rpc).toHaveBeenCalledWith("record_customer_payment_receipt", {
      p_order_id: values.orderId,
      p_expected_updated_at: values.expectedUpdatedAt,
      p_received_on: values.receivedOn,
      p_reference: values.reference,
      p_idempotency_key: values.submissionKey,
    });
    expect(rpc.mock.calls[0]?.[1]).not.toHaveProperty("p_amount");
    expect(rpc.mock.calls[0]?.[1]).not.toHaveProperty("p_account_key");
  });
});
