import { cn } from "@/lib/utils"

async function fetchSectorPerformance() {
  const apiKey = process.env.FMP_API_KEY
  const candidateKeys = apiKey ? [apiKey, "demo"] : ["demo"]

  for (const key of candidateKeys) {
    try {
      const url = new URL(
        "https://financialmodelingprep.com/api/v3/sector-performance",
      )
      url.searchParams.set("apikey", key)

      const res = await fetch(url, {
        method: "GET",
        next: {
          // The sector performance endpoint updates throughout the day, so
          // keep the cached data reasonably fresh while avoiding rate limits.
          revalidate: 900,
        },
      })

      if (!res.ok) {
        console.warn(
          `Failed to fetch sector performance with key "${key}" (${res.status})`,
        )
        continue
      }

      const payload = await res.json()

      const sectors = Array.isArray(payload)
        ? payload
        : Array.isArray(payload?.sectorPerformance)
          ? payload.sectorPerformance
          : null

      if (!sectors?.length) {
        console.warn(
          `Empty sector performance payload received with key "${key}"`,
        )
        continue
      }

      return sectors as Sector[]
    } catch (error) {
      console.error(
        `Failed to fetch sector performance with key "${key}"`,
        error,
      )
    }
  }

  return null
}

interface Sector {
  sector: string
  changesPercentage: string
}

interface ParsedSector {
  sector: string
  change: number
}

function parseSectors(data: Sector[]): ParsedSector[] {
  return data
    .map((sector) => ({
      sector: sector.sector,
      change: Number.parseFloat(sector.changesPercentage),
    }))
    .filter((sector): sector is ParsedSector => Number.isFinite(sector.change))
}

function renderEmptyState() {
  return (
    <div className="flex min-h-[6rem] items-center justify-center rounded-md border border-dashed border-neutral-200 px-4 py-6 text-sm text-neutral-500 dark:border-neutral-800 dark:text-neutral-400">
      Sector performance data is currently unavailable.
    </div>
  )
}

export default async function SectorPerformance() {
  const data = await fetchSectorPerformance()

  if (!data?.length) {
    return renderEmptyState()
  }

  const sectors = parseSectors(data)

  if (!sectors.length) {
    return renderEmptyState()
  }

  const totalChangePercentage = sectors.reduce((total, sector) => {
    return total + sector.change
  }, 0)

  const averageChangePercentage = sectors.length
    ? totalChangePercentage / sectors.length
    : 0

  const sectorsWithAverage: ParsedSector[] = [
    {
      sector: "All sectors",
      change: Number.parseFloat(averageChangePercentage.toFixed(2)),
    },
    ...sectors,
  ]

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {sectorsWithAverage.map((sector) => (
        <div
          key={sector.sector}
          className="flex w-full flex-row items-center justify-between text-sm"
        >
          <span className="font-medium">{sector.sector}</span>
          <span
            className={cn(
              "w-[4rem] min-w-fit rounded-md px-2 py-0.5 text-right transition-colors",
              sector.change > 0
                ? "bg-gradient-to-l from-green-300 text-green-800 dark:from-green-950 dark:text-green-400"
                : "bg-gradient-to-l from-red-300 text-red-800 dark:from-red-950 dark:text-red-500"
            )}
          >
            {sector.change.toFixed(2) + "%"}
          </span>
        </div>
      ))}
    </div>
  )
}
