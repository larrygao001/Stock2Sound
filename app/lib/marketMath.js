export function analyze(rows) {
  const closes = rows.map((x) => Number(x.close)).filter(Number.isFinite)
  if (closes.length < 2) {
    return { first: 0, last: 0, change: 0, volatility: 0, upDays: 0, totalDays: 0, avgVolume: 0, rsi: 50 }
  }
  const first = closes[0] || 1
  const last = closes.at(-1) || first
  const changes = closes.slice(1).map((v, i) => (v - closes[i]) / closes[i])
  const mean = changes.reduce((a, b) => a + b, 0) / Math.max(1, changes.length)
  const variance = changes.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, changes.length)
  const volatility = Math.sqrt(variance) * 100
  const upDays = changes.filter((x) => x > 0).length
  const volumes = rows.map((x) => Number(x.volume) || 0)
  const avgVolume = volumes.reduce((a, b) => a + b, 0) / Math.max(1, volumes.length)
  const gains = changes.map((x) => Math.max(0, x))
  const losses = changes.map((x) => Math.max(0, -x))
  const avgGain = gains.slice(-14).reduce((a, b) => a + b, 0) / 14
  const avgLoss = losses.slice(-14).reduce((a, b) => a + b, 0) / 14
  const rsi = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss)
  return { first, last, change: ((last - first) / first) * 100, volatility, upDays, totalDays: changes.length, avgVolume, rsi }
}

export function midiToHz(note) {
  return 440 * Math.pow(2, (note - 69) / 12)
}

export function sampleSeries(rows, count) {
  if (!rows?.length) return []
  if (rows.length <= count) return rows
  const step = (rows.length - 1) / (count - 1)
  return Array.from({ length: count }, (_, i) => rows[Math.round(i * step)])
}

export function normalizeSeries(rows) {
  const closes = rows.map((row) => Number(row.close)).filter(Number.isFinite)
  if (!closes.length) return []
  const min = Math.min(...closes)
  const max = Math.max(...closes)
  const range = Math.max(0.0001, max - min)
  return rows.map((row) => ({
    ...row,
    norm: (Number(row.close) - min) / range,
  }))
}
