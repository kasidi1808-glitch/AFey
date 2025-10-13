import yahooFinance from "yahoo-finance2"
import { Cookie } from "tough-cookie"

const CONFIG_FAKE_URL = "http://config.yf2/"
const CONSENT_REDIRECT_PATTERN = /guce.yahoo/
const DEFAULT_QUOTE_URL = "https://finance.yahoo.com/quote/AAPL"
const GET_CRUMB_URL = "https://query1.finance.yahoo.com/v1/test/getcrumb"
const USER_AGENT = "Mozilla/5.0 (compatible; yahoo-finance2/2.11.2)"

const parseHtmlEntities = (value: string) =>
  value.replace(/&#x([0-9A-Fa-f]{1,3});/gi, (_, numStr) =>
    String.fromCharCode(parseInt(numStr, 16))
  )

let cachedCrumb: string | null = null
let crumbPromise: Promise<string> | null = null

type ResponseWithRawHeaders = {
  headers: {
    raw(): Record<string, string[] | undefined>
    get(name: string): string | null
  }
  status: number
  statusText: string
  text(): Promise<string>
}

function getSetCookieHeaders(response: ResponseWithRawHeaders) {
  const rawHeaders = response.headers.raw()
  return rawHeaders["set-cookie"]
}

type CrumbRequestInit = RequestInit & { devel?: boolean | string }

type YahooFinanceEnv = {
  fetch?: (
    url: string,
    init?: CrumbRequestInit
  ) => Promise<ResponseWithRawHeaders>
}

type YahooFinanceCookieJar = {
  getCookies(
    url: string,
    options?: { expire?: boolean }
  ): Promise<Array<{ key: string; value: string }>>
  getCookieString(url: string): Promise<string>
  setFromSetCookieHeaders(
    headers: string | string[],
    url: string
  ): Promise<void>
  setCookie(cookie: Cookie, url: string): Promise<void>
}

type YahooFinanceLogger = {
  debug: (...args: unknown[]) => void
}

async function restoreCrumbFromJar(
  cookieJar: YahooFinanceCookieJar
) {
  const cookies = await cookieJar.getCookies(CONFIG_FAKE_URL)
  for (const cookie of cookies) {
    if (cookie.key === "crumb") {
      cachedCrumb = cookie.value
      break
    }
  }
}

async function ensureConsent(
  fetchFn: NonNullable<YahooFinanceEnv["fetch"]>,
  cookieJar: YahooFinanceCookieJar,
  fetchOptions: CrumbRequestInit,
  logger: YahooFinanceLogger,
  location: string
) {
  const consentFetchOptions: CrumbRequestInit = {
    ...fetchOptions,
    headers: {
      ...fetchOptions.headers,
      cookie: await cookieJar.getCookieString(location),
    },
    devel: "getCrumb-quote-AAPL-consent.html",
  }

  logger.debug("fetch", location)
  const consentResponse = await fetchFn(location, consentFetchOptions)
  const consentLocation = consentResponse.headers.get("location")

  if (!consentLocation) {
    throw new Error("Consent redirect did not include a location header")
  }

  if (!consentLocation.match(/collectConsent/)) {
    throw new Error(`Unexpected redirect to ${consentLocation}`)
  }

  const collectConsentFetchOptions: CrumbRequestInit = {
    ...consentFetchOptions,
    headers: {
      ...fetchOptions.headers,
      cookie: await cookieJar.getCookieString(consentLocation),
    },
    devel: "getCrumb-quote-AAPL-collectConsent.html",
  }

  logger.debug("fetch", consentLocation)
  const collectConsentResponse = await fetchFn(
    consentLocation,
    collectConsentFetchOptions
  )
  const collectConsentBody = await collectConsentResponse.text()
  const collectConsentResponseParams =
    Array.from(
      collectConsentBody.matchAll(
        /<input type="hidden" name="([^"]+)" value="([^"]+)">/g
      )
    )
      .map(([, name, value]) =>
        `${name}=${encodeURIComponent(parseHtmlEntities(value))}&`
      )
      .join("") + "agree=agree&agree=agree"

  const collectConsentSubmitFetchOptions: CrumbRequestInit = {
    ...consentFetchOptions,
    headers: {
      ...fetchOptions.headers,
      cookie: await cookieJar.getCookieString(consentLocation),
      "content-type": "application/x-www-form-urlencoded",
    },
    method: "POST",
    body: collectConsentResponseParams,
    devel: "getCrumb-quote-AAPL-collectConsentSubmit",
  }

  logger.debug("fetch", consentLocation)
  const collectConsentSubmitResponse = await fetchFn(
    consentLocation,
    collectConsentSubmitFetchOptions
  )
  const collectConsentSubmitSetCookie = getSetCookieHeaders(
    collectConsentSubmitResponse
  )

  if (!collectConsentSubmitSetCookie) {
    throw new Error("No set-cookie header on collect consent response")
  }

  await cookieJar.setFromSetCookieHeaders(
    collectConsentSubmitSetCookie,
    consentLocation
  )

  const collectConsentSubmitResponseLocation =
    collectConsentSubmitResponse.headers.get("location")

  if (!collectConsentSubmitResponseLocation) {
    throw new Error(
      "collectConsentSubmitResponse unexpectedly did not return a Location header"
    )
  }

  const copyConsentFetchOptions: CrumbRequestInit = {
    ...consentFetchOptions,
    headers: {
      ...fetchOptions.headers,
      cookie: await cookieJar.getCookieString(
        collectConsentSubmitResponseLocation
      ),
    },
    devel: "getCrumb-quote-AAPL-copyConsent",
  }

  logger.debug("fetch", collectConsentSubmitResponseLocation)
  const copyConsentResponse = await fetchFn(
    collectConsentSubmitResponseLocation,
    copyConsentFetchOptions
  )
  const copyConsentSetCookie = getSetCookieHeaders(copyConsentResponse)

  if (!copyConsentSetCookie) {
    throw new Error("No set-cookie header on copy consent response")
  }

  await cookieJar.setFromSetCookieHeaders(
    copyConsentSetCookie,
    collectConsentSubmitResponseLocation
  )

  const finalLocation = copyConsentResponse.headers.get("location")

  if (!finalLocation) {
    throw new Error("copyConsentResponse unexpectedly missing Location header")
  }

  const finalResponseFetchOptions: CrumbRequestInit = {
    ...fetchOptions,
    headers: {
      ...fetchOptions.headers,
      cookie: await cookieJar.getCookieString(collectConsentSubmitResponseLocation),
    },
    devel: "getCrumb-quote-AAPL-consent-final-redirect.html",
  }

  return {
    url: finalLocation,
    options: finalResponseFetchOptions,
  }
}

async function requestCrumb(
  cookieJar: YahooFinanceCookieJar,
  fetchFn: NonNullable<YahooFinanceEnv["fetch"]>,
  fetchOptionsBase: CrumbRequestInit,
  logger: YahooFinanceLogger
) {
  await restoreCrumbFromJar(cookieJar)

  if (cachedCrumb) {
    const existingCookies = await cookieJar.getCookies(DEFAULT_QUOTE_URL, {
      expire: true,
    })

    if (existingCookies.length) {
      return cachedCrumb
    }
  }

  const fetchOptions: CrumbRequestInit = {
    ...fetchOptionsBase,
    headers: {
      ...(fetchOptionsBase.headers as Record<string, string> | undefined),
      accept: "text/html,application/xhtml+xml,application/xml",
    },
    redirect: "manual" as const,
    devel:
      typeof fetchOptionsBase.devel === "string"
        ? fetchOptionsBase.devel
        : undefined,
  }

  logger.debug("Fetching crumb and cookies from", DEFAULT_QUOTE_URL)
  const response = await fetchFn(DEFAULT_QUOTE_URL, fetchOptions)
  const responseSetCookie = getSetCookieHeaders(response)

  if (!responseSetCookie) {
    throw new Error("No set-cookie header present when requesting crumb page")
  }

  await cookieJar.setFromSetCookieHeaders(responseSetCookie, DEFAULT_QUOTE_URL)

  const location = response.headers.get("location")

  let crumbSourceUrl = DEFAULT_QUOTE_URL
  let crumbFetchOptions: CrumbRequestInit = fetchOptions

  if (location) {
    if (CONSENT_REDIRECT_PATTERN.test(location)) {
      const consentResult = await ensureConsent(
        fetchFn,
        cookieJar,
        fetchOptions,
        logger,
        location
      )

      crumbSourceUrl = consentResult.url
      crumbFetchOptions = consentResult.options
    } else {
      const normalizedLocation = location.startsWith("http")
        ? location
        : new URL(location, DEFAULT_QUOTE_URL).toString()

      const { origin } = new URL(DEFAULT_QUOTE_URL)
      const redirectedUrl = new URL(normalizedLocation)

      if (redirectedUrl.origin !== origin) {
        throw new Error(`Unsupported redirect to ${location}, please report.`)
      }

      crumbSourceUrl = normalizedLocation
      crumbFetchOptions = {
        ...fetchOptions,
        headers: {
          ...(fetchOptions.headers as Record<string, string> | undefined),
          cookie: await cookieJar.getCookieString(normalizedLocation),
        },
      }
    }
  }

  const cookie = (await cookieJar.getCookies(crumbSourceUrl, { expire: true }))[0]

  if (!cookie) {
    throw new Error(
      "No set-cookie header present in Yahoo's response. Yahoo's API may have changed."
    )
  }

  const getCrumbOptions: CrumbRequestInit = {
    ...crumbFetchOptions,
    headers: {
      ...(crumbFetchOptions.headers as Record<string, string> | undefined),
      "User-Agent": USER_AGENT,
      cookie: await cookieJar.getCookieString(GET_CRUMB_URL),
      origin: "https://finance.yahoo.com",
      referer: crumbSourceUrl,
      accept: "*/*",
      "accept-encoding": "gzip, deflate, br",
      "accept-language": "en-US,en;q=0.9",
      "content-type": "text/plain",
    },
    devel: "getCrumb-getcrumb",
  }

  logger.debug("fetch", GET_CRUMB_URL)
  const getCrumbResponse = await fetchFn(GET_CRUMB_URL, getCrumbOptions)

  if (getCrumbResponse.status !== 200) {
    throw new Error(
      `Failed to get crumb, status ${getCrumbResponse.status}, statusText: ${getCrumbResponse.statusText}`
    )
  }

  const crumbFromGetCrumb = await getCrumbResponse.text()

  if (!crumbFromGetCrumb) {
    throw new Error(
      "Could not find crumb. Yahoo's API may have changed; please report."
    )
  }

  cachedCrumb = crumbFromGetCrumb
  logger.debug("New crumb:", cachedCrumb)

  await cookieJar.setCookie(
    new Cookie({
      key: "crumb",
      value: cachedCrumb!,
    }),
    CONFIG_FAKE_URL
  )

  return cachedCrumb
}

export async function ensureCrumb() {
  if (crumbPromise) {
    return crumbPromise
  }

  const env = yahooFinance._env as YahooFinanceEnv
  const cookieJar = yahooFinance._opts.cookieJar as YahooFinanceCookieJar | undefined
  const logger = yahooFinance._opts.logger as YahooFinanceLogger | undefined

  if (!env?.fetch) {
    throw new Error("yahoo-finance2 fetch environment has not been initialised")
  }

  if (!cookieJar) {
    throw new Error("yahoo-finance2 cookie jar is not available")
  }

  if (!logger) {
    throw new Error("yahoo-finance2 logger is not available")
  }

  const fetchOptions: CrumbRequestInit = {
    headers: {},
  }

  crumbPromise = requestCrumb(cookieJar, env.fetch, fetchOptions, logger).catch(
    (error) => {
      crumbPromise = null
      throw error
    }
  )

  return crumbPromise
}
