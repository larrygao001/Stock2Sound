const YAHOO_HOSTS = [
  'https://query1.finance.yahoo.com',
  'https://query2.finance.yahoo.com',
]

const ALLOWED_TYPES = new Set(['EQUITY', 'ETF', 'INDEX', 'MUTUALFUND', 'CRYPTOCURRENCY'])

function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      'cache-control': status === 200 ? 'public, s-maxage=120, stale-while-revalidate=300' : 'no-store',
    },
  })
}

async function searchYahoo(query) {
  const path = `/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=8&newsCount=0&listsCount=0&enableFuzzyQuery=true`
  let lastError = 'Ticker search is temporarily unavailable.'

  for (const host of YAHOO_HOSTS) {
    try {
      const response = await fetch(`${host}${path}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; Stock2Sound/1.0; +https://github.com/susanmu2020/Stock2Sound)',
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(10000),
      })

      if (!response.ok) {
        lastError = 'Ticker search is temporarily unavailable.'
        continue
      }

      const payload = await response.json()
      const quotes = Array.isArray(payload?.quotes) ? payload.quotes : []
      const results = quotes
        .filter((quote) => quote?.symbol && ALLOWED_TYPES.has(String(quote.quoteType || '').toUpperCase()))
        .map((quote) => ({
          symbol: String(quote.symbol).toUpperCase(),
          name: quote.shortname || quote.longname || quote.symbol,
          type: quote.quoteType || 'EQUITY',
          exchange: quote.exchDisp || quote.exchange || '',
        }))
        .filter((item, index, list) => list.findIndex((other) => other.symbol === item.symbol) === index)
        .slice(0, 8)

      return results
    } catch (error) {
      lastError = error?.name === 'TimeoutError'
        ? 'Ticker search timed out. Try again in a moment.'
        : (error?.message || lastError)
    }
  }

  throw new Error(lastError)
}

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const query = (searchParams.get('q') || '').trim()

  if (query.length < 1) {
    return json({ results: [] })
  }

  if (query.length > 32) {
    return json({ error: 'Search query is too long.' }, 400)
  }

  try {
    const results = await searchYahoo(query)
    return json({ results })
  } catch (error) {
    return json({ error: error.message || 'Unable to search tickers.', results: [] }, 502)
  }
}
