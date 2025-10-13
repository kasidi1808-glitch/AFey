import { unstable_noStore as noStore } from "next/cache"
import yahooFinance from "yahoo-finance2"
import type {
  QuoteSummaryOptions,
  QuoteSummaryResult,
} from "@/node_modules/yahoo-finance2/dist/esm/src/modules/quoteSummary"

import { ensureCrumb } from "./ensureCrumb"

export async function fetchQuoteSummary(
  ticker: string,
  queryOptionsOverrides?: QuoteSummaryOptions
) {
  noStore()

  try {
    await ensureCrumb()

    const response: QuoteSummaryResult = await yahooFinance.quoteSummary(
      ticker,
      queryOptionsOverrides ?? {
        modules: ["summaryDetail", "defaultKeyStatistics"],
      }
    )

    return response
  } catch (error) {
    console.log("Failed to fetch quote summary", error)
    throw new Error("Failed to fetch quote summary.")
  }
}
