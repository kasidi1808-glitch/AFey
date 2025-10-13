import { unstable_noStore as noStore } from "next/cache"
import type {
  ScreenerOptions,
  PredefinedScreenerModules,
  ScreenerResult,
} from "@/node_modules/yahoo-finance2/dist/esm/src/modules/screener"
import yahooFinance from "yahoo-finance2"

import { ensureCrumb } from "./ensureCrumb"

const ITEMS_PER_PAGE = 40

export async function fetchScreenerStocks(query: string, count?: number) {
  noStore()

  // PAGINATION IS HANDLED BY TENSTACK TABLE

  const queryOptions: ScreenerOptions = {
    scrIds: query as PredefinedScreenerModules,
    count: count ? count : ITEMS_PER_PAGE,
    region: "US",
    lang: "en-US",
  }

  try {
    await ensureCrumb()

    const response: ScreenerResult = await yahooFinance.screener(queryOptions, {
      validateResult: false,
    })

    return response
  } catch (error) {
    console.log("Failed to fetch screener stocks", error)
    throw new Error("Failed to fetch screener stocks.")
  }
}
