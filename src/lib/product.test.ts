import { afterEach, describe, expect, it, vi } from "vitest";

describe("product identity", () => {
  afterEach(() => {
    delete process.env.NEXT_PUBLIC_PRODUCT_NAME;
    vi.resetModules();
  });

  it("uses a generic fallback when no installation name is configured", async () => {
    delete process.env.NEXT_PUBLIC_PRODUCT_NAME;
    vi.resetModules();

    const { productName } = await import("@/lib/product");

    expect(productName).toBe("Commerce Operations");
  });

  it("uses the trimmed installation name when configured", async () => {
    process.env.NEXT_PUBLIC_PRODUCT_NAME = "  Shop Control  ";
    vi.resetModules();

    const { productName } = await import("@/lib/product");

    expect(productName).toBe("Shop Control");
  });
});
