export type WorkspaceRole = "owner" | "admin" | "manager" | "staff" | "viewer";
export const overviewTables = ["stores", "products", "orders", "customers", "expenses"] as const;
export type OverviewTable = typeof overviewTables[number];
export type WorkspaceOverview = {
  workspaceName: string;
  role: WorkspaceRole;
  stores: number;
  products: number;
  orders: number;
  customers: number | null;
  expenses: number;
};

export interface WorkspaceCountReader {
  count(table: OverviewTable, workspaceId: string): Promise<number>;
}

export async function readWorkspaceOverview(reader: WorkspaceCountReader, workspaceId: string, workspaceName: string, role: WorkspaceRole): Promise<WorkspaceOverview> {
  const [stores, products, orders, customers, expenses] = await Promise.all([
    reader.count("stores", workspaceId),
    reader.count("products", workspaceId),
    reader.count("orders", workspaceId),
    role === "viewer" ? Promise.resolve(null) : reader.count("customers", workspaceId),
    reader.count("expenses", workspaceId),
  ]);
  return { workspaceName, role, stores, products, orders, customers, expenses };
}
