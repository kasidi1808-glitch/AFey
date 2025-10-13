import { unstable_noStore as noStore } from "next/cache"
import yahooFinance from "yahoo-finance2"

import { ensureCrumb } from "./ensureCrumb"

export async function fetchQuote(ticker: string) {
  noStore()

  try {
    await ensureCrumb()

    const response = await yahooFinance.quote(ticker)

    return response
  } catch (error) {
    console.log("Failed to fetch stock quote", error)
    throw new Error("Failed to fetch stock quote.")
  }
}
