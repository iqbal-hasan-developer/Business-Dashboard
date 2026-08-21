import { describe, expect, it, vi } from "vitest";
import { recordSteadfastSettlement, reverseSteadfastSettlement } from "@/data/settlement-writes";
import { parseMoney } from "@/domain/money";

describe("settlement RPC repository", () => {
  it("uses only the atomic settlement RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: "82600000-0000-4000-8000-000000000001", error: null });
    const client = { rpc } as unknown as Parameters<typeof recordSteadfastSettlement>[0];
    const eligible = [{ orderId: "82400000-0000-4000-8000-000000000001", orderNumber: "NN-1", orderDate: "2026-07-22", customerName: "Customer", expectedUpdatedAt: "2026-07-22T10:00:00+00:00", grossCodReceivable: parseMoney("580") }];
    const values = { settlementDate: "2026-07-22", receiptTreatment: "business_account" as const, receivingMethod: "bkash" as const, ownerAllocations: [], grossCodAmount: "580", deductions: "30", netReceived: "550", courierReference: "ST-1", receivingAccountLabel: "", receivingAccountLast4: "1234", transactionReference: "TX-1", note: "", selectedOrderIds: [eligible[0].orderId], idempotencyKey: "82500000-0000-4000-8000-000000000001" };
    await expect(recordSteadfastSettlement(client, values, eligible)).resolves.toBe("82600000-0000-4000-8000-000000000001");
    expect(rpc).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledWith("record_steadfast_cod_settlement_v3", expect.objectContaining({ p_receipt_treatment: "business_account", p_receiving_method: "bkash", p_owner_allocations: [], p_net_received: 550 }));
  });

  it("uses the owner-only append-only reversal RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: "82600000-0000-4000-8000-000000000002", error: null });
    const client = { rpc } as unknown as Parameters<typeof reverseSteadfastSettlement>[0];
    const values = { settlementId: "82600000-0000-4000-8000-000000000001", reversedOn: "2026-08-08", reason: "Incorrect courier batch", idempotencyKey: "82500000-0000-4000-8000-000000000002" };
    await expect(reverseSteadfastSettlement(client, values)).resolves.toBe("82600000-0000-4000-8000-000000000002");
    expect(rpc).toHaveBeenCalledWith("reverse_steadfast_cod_settlement", {
      p_settlement_id: values.settlementId,
      p_reversed_on: values.reversedOn,
      p_reason: values.reason,
      p_idempotency_key: values.idempotencyKey,
    });
  });
});
