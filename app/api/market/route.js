const RANGE_CONFIG = {
  '1d': { yahooRange: '1d', interval: '5m', granularity: '5m' },
  '5d': { yahooRange: '5d', interval: '15m', granularity: '15m' },
  '1mo': { yahooRange: '1mo', interval: '1d', granularity: '1d' },
  '3mo': { yahooRange: '3mo', interval: '1d', granularity: '1d' },
  '6mo': { yahooRange: '6mo', interval: '1d', granularity: '1d' },
  '1y': { yahooRange: '1y', interval: '1d', granularity: '1d' },
  '2y': { yahooRange: '2y', interval: '1d', granularity: '1d' },
  '5y': { yahooRange: '5y', interval: '1wk', granularity: '1wk' },
}

const YAHOO_HOSTS = [
  'https://query1.finance.yahoo.com',
  'https://query2.finance.yahoo.com',
]

function json(data, status = 200, extra = {}) {
  return Response.json(data, {
    status,
    headers: {
      'cache-control': status === 200 ? 'public, s-maxage=300, stale-while-revalidate=600' : 'no-store',
      ...extra,
    },
  })
}

function formatStamp(stampSeconds, interval) {
  const date = new Date(stampSeconds * 1000)
  const intraday = /m$|h$/.test(interval)
  if (intraday) {
    // Keep session time so 5m/15m bars don't collapse onto one calendar day.
    return date.toISOString().replace('T', ' ').slice(0, 16)
  }
  if (interval === '1wk') {
    return date.toISOString().slice(0, 10)
  }
  return date.toISOString().slice(0, 10)
}

function parseYahooChart(payload, interval) {
  const result = payload?.chart?.result?.[0]
  if (!result?.timestamp?.length) return null
  const quote = result.indicators?.quote?.[0]
  if (!quote?.close) return null

  const rows = result.timestamp
    .map((stamp, i) => ({
      date: formatStamp(stamp, interval),
      close: quote.close[i],
      volume: quote.volume?.[i] || 0,
    }))
    .filter((row) => Number.isFinite(row.close))

  if (rows.length < 3) return null

  return {
    symbol: result.meta?.symbol || '',
    currency: result.meta?.currency || 'USD',
    exchange: result.meta?.exchangeName || result.meta?.fullExchangeName || '',
    rows,
    source: 'Yahoo Finance',
    range: result.meta?.range || '',
    interval: result.meta?.dataGranularity || interval,
  }
}

function notFoundMessage(symbol) {
  return `We couldn't find a ticker called “${symbol}”. It may be misspelled or nonexistent — try another symbol or pick a suggestion.`
}

function friendlyProviderError(status, symbol) {
  if (status === 404) return notFoundMessage(symbol)
  if (status === 429) return 'Too many market data requests right now. Wait a moment and try again.'
  if (status >= 500) return 'Market data is temporarily unavailable. Try again in a moment.'
  return 'We could not load market data for that ticker. Try another symbol.'
}

async function fetchYahoo(symbol, rangeKey) {
  const config = RANGE_CONFIG[rangeKey]
  const path = `/v8/finance/chart/${encodeURIComponent(symbol)}?range=${encodeURIComponent(config.yahooRange)}&interval=${encodeURIComponent(config.interval)}&events=history`
  let lastError = 'We could not load market data for that ticker. Try another symbol.'
  let lastStatus = 502

  for (const host of YAHOO_HOSTS) {
    try {
      const response = await fetch(`${host}${path}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; Stock2Sound/1.0; +https://github.com/susanmu2020/Stock2Sound)',
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(12000),
      })

      if (!response.ok) {
        lastStatus = response.status === 404 ? 404 : response.status >= 500 ? 502 : 502
        lastError = friendlyProviderError(response.status, symbol)
        if (response.status === 404) break
        continue
      }

      const payload = await response.json()
      if (payload?.chart?.error) {
        const code = String(payload.chart.error.code || '').toLowerCase()
        const description = String(payload.chart.error.description || '').toLowerCase()
        if (code.includes('not found') || description.includes('no data') || description.includes('delisted')) {
          lastStatus = 404
          lastError = notFoundMessage(symbol)
          break
        }
        lastStatus = 502
        lastError = 'We could not load market data for that ticker. Try another symbol.'
        continue
      }

      const parsed = parseYahooChart(payload, config.interval)
      if (!parsed) {
        lastStatus = 404
        lastError = notFoundMessage(symbol)
        continue
      }

      return {
        ...parsed,
        requestedRange: rangeKey,
        granularity: config.granularity,
      }
    } catch (error) {
      lastStatus = 502
      lastError = error?.name === 'TimeoutError'
        ? 'Market data took too long to respond. Try again in a moment.'
        : 'We could not reach market data right now. Try again in a moment.'
    }
  }

  const error = new Error(lastError)
  error.status = lastStatus
  throw error
}

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const symbol = (searchParams.get('symbol') || '').trim().toUpperCase()
  const range = (searchParams.get('range') || '3mo').trim().toLowerCase()

  if (!/^[A-Z0-9.^_-]{1,18}$/.test(symbol)) {
    return json({ error: 'Enter a ticker symbol like NVDA or AAPL.', code: 'invalid_symbol' }, 400)
  }

  if (!RANGE_CONFIG[range]) {
    return json({ error: 'Pick a supported time range.', code: 'invalid_range' }, 400)
  }

  try {
    const data = await fetchYahoo(symbol, range)
    return json(data)
  } catch (error) {
    const status = error.status === 404 ? 404 : 502
    return json({
      error: error.message || 'Unable to load market data.',
      code: status === 404 ? 'ticker_not_found' : 'provider_error',
    }, status)
  }
}
