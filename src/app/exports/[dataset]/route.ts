import { buildFinancialReportCsv, buildOrdersCsv, buildProductsCsv } from "@/domain/exports";
import { dhakaBusinessDate } from "@/domain/reporting-period";
import { getBusinessRepository } from "@/data/provider";
import { getDashboardUser } from "@/lib/auth/session";

const filenames = {
  orders: "orders",
  products: "products",
  "financial-report": "financial-report",
} as const;

type ExportDataset = keyof typeof filenames;

function csvResponse(csv: string, dataset: ExportDataset) {
  const filename = `nexanotion-${filenames[dataset]}-${dhakaBusinessDate()}.csv`;
  return new Response(csv, {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Type": "text/csv; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function GET(_request: Request, { params }: { params: Promise<{ dataset: string }> }) {
  const user = await getDashboardUser();
  if (!user) return Response.json({ error: "Authentication required." }, { status: 401 });
  if (user.role !== "owner") return Response.json({ error: "Owner access is required." }, { status: 403 });

  const { dataset: requestedDataset } = await params;
  if (!(requestedDataset in filenames)) return Response.json({ error: "Export not found." }, { status: 404 });
  const dataset = requestedDataset as ExportDataset;

  try {
    const repository = await getBusinessRepository();
    if (dataset === "orders") return csvResponse(buildOrdersCsv(await repository.getOrders()), dataset);
    if (dataset === "products") {
      const [products, categories] = await Promise.all([repository.getProducts(), repository.getProductCategories()]);
      return csvResponse(buildProductsCsv(products, categories), dataset);
    }
    return csvResponse(buildFinancialReportCsv(await repository.getDashboard()), dataset);
  } catch {
    return Response.json({ error: "Unable to prepare the export." }, { status: 500 });
  }
}
