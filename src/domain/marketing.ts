import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a valid date.");
const databaseTimestamp = z.string().datetime({ offset: true, message: "This record has an invalid update timestamp. Refresh the page and try again." });
const wholeNumber = z.union([z.string(), z.number()]).transform((value, context) => {
  if (value === "" || value === null || value === undefined) return null;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    context.addIssue({ code: "custom", message: "Use a non-negative whole number." });
    return z.NEVER;
  }
  return parsed;
}).nullable().optional();

export const marketingFiltersSchema = z.object({
  range: z.enum(["lifetime", "7d", "30d", "month", "custom"]).default("lifetime"),
  start: z.string().optional(), end: z.string().optional(), campaign: z.string().optional(), platform: z.string().optional(),
}).superRefine((value, context) => {
  if (value.range === "custom" && (!isoDate.safeParse(value.start).success || !isoDate.safeParse(value.end).success)) context.addIssue({ code: "custom", message: "Custom dates are required." });
  if (value.start && value.end && value.start > value.end) context.addIssue({ code: "custom", path: ["end"], message: "End date must be on or after start date." });
});

export const editAdSpendSchema = z.object({
  spendId: z.string().uuid(), campaignId: z.string().uuid(), spendDate: isoDate,
  platform: z.string().trim().min(2).max(100), amount: z.string().trim().regex(/^\d+(\.\d{1,2})?$/, "Use a positive amount with up to 2 decimals.").refine((value) => Number(value) > 0, "Amount must be greater than zero."),
  sourceReference: z.string().trim().max(160), reason: z.string().trim().min(3).max(500), expectedUpdatedAt: databaseTimestamp,
});

export const deleteAdSpendSchema = z.object({ spendId: z.string().uuid(), reason: z.string().trim().min(3).max(500), expectedUpdatedAt: databaseTimestamp });

export const campaignPerformanceSchema = z.object({
  campaignId: z.string().uuid(), resultsCount: wholeNumber, resultType: z.string().trim().max(160), impressions: wholeNumber, reach: wholeNumber,
  totalMessagingContacts: wholeNumber, newMessagingContacts: wholeNumber, purchases: wholeNumber,
  attributionSetting: z.string().trim().max(160), sourceReference: z.string().trim().max(200), reason: z.string().trim().min(3).max(500), expectedUpdatedAt: databaseTimestamp,
}).superRefine((value, context) => {
  if (value.reach != null && value.impressions != null && value.reach > value.impressions) context.addIssue({ code: "custom", path: ["reach"], message: "Reach cannot exceed impressions." });
  if (value.newMessagingContacts != null && value.totalMessagingContacts != null && value.newMessagingContacts > value.totalMessagingContacts) context.addIssue({ code: "custom", path: ["newMessagingContacts"], message: "New contacts cannot exceed total contacts." });
});

export type EditAdSpendValues = z.infer<typeof editAdSpendSchema>;
export type DeleteAdSpendValues = z.infer<typeof deleteAdSpendSchema>;
export type CampaignPerformanceValues = z.infer<typeof campaignPerformanceSchema>;

export function resolveMarketingDates(referenceDate: string, range: string, start?: string, end?: string) {
  if (range === "lifetime") return { startDate: null, endDate: null };
  if (range === "custom") return { startDate: start ?? null, endDate: end ?? null };
  const reference = new Date(`${referenceDate}T12:00:00Z`);
  const startDate = new Date(reference);
  if (range === "7d") startDate.setUTCDate(startDate.getUTCDate() - 6);
  else if (range === "30d") startDate.setUTCDate(startDate.getUTCDate() - 29);
  else startDate.setUTCDate(1);
  return { startDate: startDate.toISOString().slice(0, 10), endDate: referenceDate };
}

export function safeMarketingError(error: unknown) {
  const message = error instanceof Error ? error.message : "The marketing update could not be saved.";
  if (/changed; refresh/i.test(message)) return "This record changed after you opened it. Refresh and try again.";
  if (/not authorized|permission|42501/i.test(message)) return "Your dashboard role cannot perform this action.";
  if (/duplicate|unique/i.test(message)) return "That spend record conflicts with an existing entry.";
  return "The marketing update could not be saved. No partial change was kept.";
}
