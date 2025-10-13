import { unstable_noStore as noStore } from "next/cache"
import yahooFinance from "yahoo-finance2"
import type { QuoteOptions, Quote } from "@/node_modules/yahoo-finance2/dist/esm/src/modules/quote"

import { ensureCrumb } from "./ensureCrumb"

export async function fetchQuoteCombine(
  ticker: string,
  queryOptionsOverrides?: QuoteOptions
) {
  noStore()

  try {
    await ensureCrumb()

    const response: Quote = await yahooFinance.quoteCombine(
      ticker,
      queryOptionsOverrides
    )

    return response
  } catch (error) {
    console.log("Failed to fetch combined quote", error)
    throw new Error("Failed to fetch combined quote.")
  }
}
