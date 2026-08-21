import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const workspace = readFileSync(
  join(process.cwd(), "src", "components", "cash", "cash-workspace.tsx"),
  "utf8",
);

describe("CashWorkspace Select control contract", () => {
  it("keeps owner selects controlled while their form value is empty", () => {
    expect(workspace).not.toContain("field.value || undefined");
    expect(workspace.match(/<Select value=\{field\.value \|\| null\}/g)).toHaveLength(2);
  });
});
