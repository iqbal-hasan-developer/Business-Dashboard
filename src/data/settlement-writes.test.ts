import { describe, expect, it, vi } from "vitest";
import { recordSteadfastSettlement } from "@/data/settlement-writes";
import { parseMoney } from "@/domain/money";

describe("settlement RPC repository", () => {
  it("uses only the atomic settlement RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: "82600000-0000-4000-8000-000000000001", error: null });
    const client = { rpc } as unknown as Parameters<typeof recordSteadfastSettlement>[0];
    const eligible = [{ orderId: "82400000-0000-4000-8000-000000000001", orderNumber: "NN-1", orderDate: "2026-07-22", customerName: "Customer", expectedUpdatedAt: "2026-07-22T10:00:00+00:00", grossCodReceivable: parseMoney("580") }];
    const values = { settlementDate: "2026-07-22", receivingMethod: "bkash" as const, grossCodAmount: "580", deductions: "30", netReceived: "550", courierReference: "ST-1", receivingAccountLabel: "", receivingAccountLast4: "1234", transactionReference: "TX-1", note: "", selectedOrderIds: [eligible[0].orderId], idempotencyKey: "82500000-0000-4000-8000-000000000001" };
    await expect(recordSteadfastSettlement(client, values, eligible)).resolves.toBe("82600000-0000-4000-8000-000000000001");
    expect(rpc).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledWith("record_steadfast_cod_settlement", expect.objectContaining({ p_receiving_method: "bkash", p_net_received: 550 }));
  });
});
