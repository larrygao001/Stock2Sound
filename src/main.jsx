import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Activity, ArrowDownRight, ArrowUpRight, AudioLines, BarChart3, Download, Headphones, Music2, Pause, Play, RefreshCw, Sparkles, Upload, Volume2, Waves } from 'lucide-react'
import './style.css'

const DEMO = [
  182, 185, 183, 189, 191, 187, 194, 198, 196, 201, 197, 204, 208, 205, 211, 216,
  213, 219, 224, 221, 228, 225, 231, 237, 233, 240, 236, 243, 248, 244, 251, 247,
  255, 260, 256, 263, 258, 267, 272, 268, 276, 271, 280, 286, 281, 289, 294, 290
].map((close, i) => ({ date: new Date(Date.now() - (47 - i) * 86400000).toISOString().slice(0, 10), close, volume: 800000 + ((i * 173921) % 1900000) }))

const PRESETS = {
  Adaptive: { wave: 'triangle', scale: [0, 2, 4, 7, 9, 11], bass: 'sine', beat: 0.25 },
  Ambient: { wave: 'sine', scale: [0, 2, 3, 7, 9], bass: 'sine', beat: 0.34 },
  Electronic: { wave: 'sawtooth', scale: [0, 2, 4, 7, 9, 11], bass: 'square', beat: 0.18 },
  Jazz: { wave: 'triangle', scale: [0, 3, 5, 7, 10], bass: 'sine', beat: 0.28 },
  Cinematic: { wave: 'sine', scale: [0, 2, 5, 7, 9], bass: 'triangle', beat: 0.4 }
}

function analyze(rows) {
  const closes = rows.map(x => Number(x.close)).filter(Number.isFinite)
  const first = closes[0] || 1
  const last = closes.at(-1) || first
  const changes = closes.slice(1).map((v, i) => (v - closes[i]) / closes[i])
  const mean = changes.reduce((a, b) => a + b, 0) / Math.max(1, changes.length)
  const variance = changes.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, changes.length)
  const volatility = Math.sqrt(variance) * 100
  const upDays = changes.filter(x => x > 0).length
  const volumes = rows.map(x => Number(x.volume) || 0)
  const avgVolume = volumes.reduce((a, b) => a + b, 0) / Math.max(1, volumes.length)
  const gains = changes.map(x => Math.max(0, x))
  const losses = changes.map(x => Math.max(0, -x))
  const avgGain = gains.slice(-14).reduce((a, b) => a + b, 0) / 14
  const avgLoss = losses.slice(-14).reduce((a, b) => a + b, 0) / 14
  const rsi = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss)
  return { first, last, change: ((last - first) / first) * 100, volatility, upDays, totalDays: changes.length, avgVolume, rsi }
}

function midiToHz(note) { return 440 * Math.pow(2, (note - 69) / 12) }

function App() {
  const [ticker, setTicker] = useState('NVDA')
  const [period, setPeriod] = useState('3mo')
  const [style, setStyle] = useState('Adaptive')
  const [rows, setRows] = useState(DEMO)
  const [source, setSource] = useState('Illustrative demo data')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [volume, setVolume] = useState(65)
  const audioRef = useRef(null)
  const timerRef = useRef(null)
  const oscillatorsRef = useRef([])
  const masterRef = useRef(null)
  const analysis = useMemo(() => analyze(rows), [rows])
  const preset = PRESETS[style]

  useEffect(() => () => stopMusic(), [])

  async function loadMarket() {
    const symbol = ticker.trim().toUpperCase()
    if (!symbol) return
    setLoading(true); setError('')
    try {
      const range = period
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=1d&events=history`
      let response
      try { response = await fetch(url) } catch { response = null }
      if (!response?.ok) {
        const proxy = 'https://api.allorigins.win/raw?url=' + encodeURIComponent(url)
        response = await fetch(proxy)
      }
      if (!response.ok) throw new Error('Market data provider did not return a usable response.')
      const json = await response.json()
      const result = json.chart?.result?.[0]
      if (!result?.timestamp?.length) throw new Error('No historical price data found for this ticker. Check the symbol or upload a CSV.')
      const quote = result.indicators.quote[0]
      const next = result.timestamp.map((stamp, i) => ({
        date: new Date(stamp * 1000).toISOString().slice(0, 10),
        close: quote.close[i],
        volume: quote.volume[i] || 0
      })).filter(x => Number.isFinite(x.close))
      if (next.length < 3) throw new Error('Not enough price history to compose music.')
      setRows(next); setSource('Yahoo Finance historical data'); setProgress(0); stopMusic()
    } catch (e) {
      setError(e.message + ' You can also import a CSV with Date, Close and optional Volume columns.')
    } finally { setLoading(false) }
  }

  function importCsv(event) {
    const file = event.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const lines = String(reader.result).trim().split(/\r?\n/)
        const headers = lines.shift().split(',').map(x => x.trim().toLowerCase().replaceAll('"', ''))
        const dateIndex = headers.findIndex(x => x.includes('date') || x.includes('time'))
        const closeIndex = headers.findIndex(x => ['close', 'adj close', 'adj_close', 'price'].includes(x))
        const volumeIndex = headers.findIndex(x => x.includes('volume'))
        if (closeIndex < 0) throw new Error('CSV needs a Close or Price column.')
        const parsed = lines.map(line => {
          const cells = line.split(',').map(x => x.trim().replaceAll('"', ''))
          return { date: dateIndex >= 0 ? cells[dateIndex] : '', close: Number(cells[closeIndex]), volume: volumeIndex >= 0 ? Number(cells[volumeIndex]) : 0 }
        }).filter(x => Number.isFinite(x.close))
        if (parsed.length < 3) throw new Error('CSV needs at least three valid price rows.')
        setRows(parsed); setSource(file.name); setError(''); setProgress(0); stopMusic()
      } catch (e) { setError(e.message) }
    }
    reader.readAsText(file)
    event.target.value = ''
  }

  function stopMusic() {
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = null
    oscillatorsRef.current.forEach(o => { try { o.stop() } catch {} })
    oscillatorsRef.current = []
    setPlaying(false)
  }

  function playMusic() {
    if (playing) { stopMusic(); return }
    const AudioContextClass = window.AudioContext || window.webkitAudioContext
    if (!AudioContextClass) { setError('Your browser does not support Web Audio. Try the latest Chrome, Safari or Firefox.'); return }
    const ctx = audioRef.current || new AudioContextClass()
    audioRef.current = ctx
    if (ctx.state === 'suspended') ctx.resume()
    const master = ctx.createGain()
    master.gain.value = volume / 100 * 0.22
    master.connect(ctx.destination)
    masterRef.current = master
    const values = rows.map(x => x.close)
    const min = Math.min(...values), max = Math.max(...values)
    const range = Math.max(0.0001, max - min)
    const data = rows.slice(-64)
    const metrics = analyze(rows)
    const volatilityFactor = Math.min(1.8, Math.max(0.65, metrics.volatility / 1.8))
    const volumeMax = Math.max(1, ...data.map(x => x.volume || 0))
    const secondsPerNote = preset.beat / volatilityFactor
    const baseMidi = metrics.change >= 0 ? 55 : 50
    const scale = preset.scale
    const duration = data.length * secondsPerNote
    data.forEach((point, i) => {
      const normalized = (point.close - min) / range
      const degree = Math.round(normalized * 18)
      const octave = Math.floor(degree / scale.length)
      const semitone = scale[degree % scale.length]
      const midi = baseMidi + octave * 12 + semitone
      const time = ctx.currentTime + i * secondsPerNote
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = preset.wave
      osc.frequency.setValueAtTime(midiToHz(midi), time)
      const loudness = 0.08 + ((point.volume || 0) / volumeMax) * 0.13
      gain.gain.setValueAtTime(0.0001, time)
      gain.gain.linearRampToValueAtTime(loudness, time + 0.025)
      gain.gain.exponentialRampToValueAtTime(0.0001, time + secondsPerNote * 0.92)
      osc.connect(gain); gain.connect(master)
      osc.start(time); osc.stop(time + secondsPerNote)
      oscillatorsRef.current.push(osc)
      if (i % 2 === 0) {
        const bass = ctx.createOscillator(), bassGain = ctx.createGain()
        bass.type = preset.bass
        bass.frequency.setValueAtTime(midiToHz(baseMidi - 12 + (metrics.change > 0 ? 0 : -2)), time)
        bassGain.gain.setValueAtTime(0.0001, time)
        bassGain.gain.linearRampToValueAtTime(0.11, time + 0.015)
        bassGain.gain.exponentialRampToValueAtTime(0.0001, time + secondsPerNote * 0.65)
        bass.connect(bassGain); bassGain.connect(master)
        bass.start(time); bass.stop(time + secondsPerNote * 0.7)
        oscillatorsRef.current.push(bass)
      }
      if (i % Math.max(2, Math.round(5 / volatilityFactor)) === 0) {
        const drum = ctx.createOscillator(), drumGain = ctx.createGain()
        drum.type = 'sine'; drum.frequency.setValueAtTime(110, time); drum.frequency.exponentialRampToValueAtTime(42, time + 0.12)
        drumGain.gain.setValueAtTime(0.0001, time); drumGain.gain.linearRampToValueAtTime(0.16, time + 0.008); drumGain.gain.exponentialRampToValueAtTime(0.0001, time + 0.14)
        drum.connect(drumGain); drumGain.connect(master); drum.start(time); drum.stop(time + 0.15)
        oscillatorsRef.current.push(drum)
      }
    })
    setPlaying(true); setProgress(0)
    const started = Date.now()
    timerRef.current = setInterval(() => {
      const p = Math.min(100, ((Date.now() - started) / (duration * 1000)) * 100)
      setProgress(p)
      if (p >= 100) stopMusic()
    }, 80)
  }

  function downloadWav() {
    const sampleRate = 44100
    const values = rows.slice(-64)
    const seconds = preset.beat / Math.min(1.8, Math.max(0.65, analysis.volatility / 1.8))
    const length = Math.floor(values.length * seconds * sampleRate)
    const buffer = new ArrayBuffer(44 + length * 2)
    const view = new DataView(buffer)
    const write = (offset, text) => [...text].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)))
    write(0, 'RIFF'); view.setUint32(4, 36 + length * 2, true); write(8, 'WAVE'); write(12, 'fmt ')
    view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, sampleRate, true)
    view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true); write(36, 'data'); view.setUint32(40, length * 2, true)
    const min = Math.min(...values.map(x => x.close)), max = Math.max(...values.map(x => x.close)), range = Math.max(0.0001, max - min)
    for (let i = 0; i < length; i++) {
      const t = i / sampleRate, index = Math.min(values.length - 1, Math.floor(t / seconds))
      const point = values[index], normalized = (point.close - min) / range
      const degree = Math.round(normalized * 18), scale = preset.scale
      const midi = 55 + Math.floor(degree / scale.length) * 12 + scale[degree % scale.length]
      const local = (t % seconds) / seconds
      const envelope = Math.min(1, local * 18) * Math.max(0, 1 - local) ** 1.4
      let sample = Math.sin(2 * Math.PI * midiToHz(midi) * t) * envelope * 0.34
      sample += Math.sin(2 * Math.PI * midiToHz(43) * t) * envelope * 0.12
      sample = Math.max(-1, Math.min(1, sample))
      view.setInt16(44 + i * 2, sample * 32767, true)
    }
    const blob = new Blob([buffer], { type: 'audio/wav' })
    const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `stock2sound-${ticker.toLowerCase()}-${period}.wav`; link.click()
    URL.revokeObjectURL(link.href)
  }

  const changePositive = analysis.change >= 0
  const chartPoints = rows.slice(-32)
  const chartMin = Math.min(...chartPoints.map(x => x.close)), chartMax = Math.max(...chartPoints.map(x => x.close))
  const points = chartPoints.map((p, i) => `${(i / Math.max(1, chartPoints.length - 1)) * 100},${92 - ((p.close - chartMin) / Math.max(0.0001, chartMax - chartMin)) * 78}`).join(' ')

  return <main className="app-shell">
    <header className="topbar">
      <a className="brand" href="#"><span className="brand-mark"><AudioLines size={19}/></span>stock<span>2</span>sound</a>
      <div className="topbar-right"><span className="live-dot"></span><span>MARKET DATA → MUSIC</span><a href="https://github.com/susanmu2020/Stock2Sound" target="_blank" rel="noreferrer">GitHub <span>↗</span></a></div>
    </header>

    <section className="hero">
      <div className="eyebrow"><Sparkles size={13}/> YOUR PORTFOLIO, REIMAGINED</div>
      <h1>Hear the <em>market.</em></h1>
      <p className="hero-copy">Turn price action into sound. Every rise, dip and volume spike becomes part of your track.</p>
      <div className="hero-wave"><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span></div>
    </section>

    <section className="workspace">
      <div className="section-head"><div><span className="step">01</span><h2>Choose your market</h2></div><span className="muted">START WITH A TICKER</span></div>
      <div className="control-panel">
        <div className="ticker-control"><label htmlFor="ticker">TICKER SYMBOL</label><div className="ticker-input"><span>$</span><input id="ticker" value={ticker} onChange={e => setTicker(e.target.value.toUpperCase())} onKeyDown={e => e.key === 'Enter' && loadMarket()} placeholder="NVDA" maxLength={18}/><button className="fetch-btn" onClick={loadMarket} disabled={loading}>{loading ? <RefreshCw className="spin" size={15}/> : <Activity size={15}/>} {loading ? 'LOADING' : 'LOAD DATA'}</button></div></div>
        <div className="period-control"><label htmlFor="period">TIME RANGE</label><select id="period" value={period} onChange={e => setPeriod(e.target.value)}><option value="1mo">1 MONTH</option><option value="3mo">3 MONTHS</option><option value="6mo">6 MONTHS</option><option value="1y">1 YEAR</option><option value="2y">2 YEARS</option></select></div>
        <label className="upload-btn"><Upload size={15}/> IMPORT CSV<input type="file" accept=".csv,text/csv" onChange={importCsv}/></label>
      </div>
      {error && <div className="error-message">{error}</div>}
      <div className="data-source"><span className="source-dot"></span> {source} <span>·</span> {rows.length} data points</div>

      <div className="section-head market-heading"><div><span className="step">02</span><h2>Read the rhythm</h2></div><span className="muted">MARKET DNA</span></div>
      <div className="market-grid">
        <div className="chart-card">
          <div className="card-top"><div><span className="tiny-label">PRICE MOVEMENT</span><div className="price-title">{ticker || '—'} <span className={changePositive ? 'positive' : 'negative'}>{changePositive ? <ArrowUpRight size={16}/> : <ArrowDownRight size={16}/>} {analysis.change >= 0 ? '+' : ''}{analysis.change.toFixed(2)}%</span></div></div><BarChart3 size={18} className="subtle-icon"/></div>
          <div className="chart-wrap"><svg viewBox="0 0 100 100" preserveAspectRatio="none" className="chart-svg"><defs><linearGradient id="area" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#c7f36b" stopOpacity=".24"/><stop offset="100%" stopColor="#c7f36b" stopOpacity="0"/></linearGradient></defs><line x1="0" y1="20" x2="100" y2="20" className="gridline"/><line x1="0" y1="50" x2="100" y2="50" className="gridline"/><line x1="0" y1="80" x2="100" y2="80" className="gridline"/><polygon points={`0,100 ${points} 100,100`} fill="url(#area)"/><polyline points={points} fill="none" stroke="#c7f36b" strokeWidth="1.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round"/></svg></div>
          <div className="chart-foot"><span>{chartPoints[0]?.date || '—'}</span><span>{chartPoints.at(-1)?.date || '—'}</span></div>
        </div>
        <div className="metrics-card">
          <div className="metric"><span>VOLATILITY</span><strong>{analysis.volatility.toFixed(2)}<small>%</small></strong><div className="metric-bar"><i style={{width: `${Math.min(100, analysis.volatility * 12)}%`}}/></div></div>
          <div className="metric"><span>RSI · 14</span><strong>{analysis.rsi.toFixed(0)}<small>/ 100</small></strong><div className="metric-bar"><i style={{width: `${analysis.rsi}%`}}/></div></div>
          <div className="metric"><span>UP DAYS</span><strong>{analysis.upDays}<small> / {analysis.totalDays}</small></strong><div className="metric-bar"><i style={{width: `${analysis.upDays / Math.max(1, analysis.totalDays) * 100}%`}}/></div></div>
        </div>
      </div>

      <div className="section-head music-heading"><div><span className="step">03</span><h2>Make it music</h2></div><span className="muted">GENERATIVE AUDIO</span></div>
      <div className="music-card">
        <div className="music-card-top"><div><div className="tiny-label">SOUND PROFILE</div><h3>{style === 'Adaptive' ? 'Adaptive composition' : `${style} composition`}</h3><p>Built from {ticker || 'your ticker'} · {rows.length} sessions · {analysis.volatility.toFixed(1)}% volatility</p></div><div className="music-icon"><Waves size={23}/></div></div>
        <div className="style-picker"><span>CHOOSE A VIBE</span><div className="style-options">{Object.keys(PRESETS).map(s => <button key={s} onClick={() => {setStyle(s); stopMusic()}} className={style === s ? 'selected' : ''}>{s === 'Adaptive' && <Sparkles size={12}/>} {s}</button>)}</div></div>
        <div className="player">
          <button className="play-button" onClick={playMusic}>{playing ? <Pause size={21} fill="currentColor"/> : <Play size={21} fill="currentColor"/>}</button>
          <div className="player-main"><div className="player-meta"><strong>{playing ? 'Now playing' : 'Ready to compose'}</strong><span>{playing ? 'LIVE SYNTHESIS' : 'PRESS PLAY TO GENERATE'}</span></div><div className="progress-track"><i style={{width: `${progress}%`}}/></div></div>
          <div className="volume-control"><Volume2 size={15}/><input aria-label="Volume" type="range" min="0" max="100" value={volume} onChange={e => {setVolume(Number(e.target.value)); if (masterRef.current) masterRef.current.gain.value = Number(e.target.value) / 100 * 0.22}}/></div>
          <button className="download-button" onClick={downloadWav}><Download size={16}/><span>WAV</span></button>
        </div>
        <div className="mapping-note"><div><Music2 size={14}/><span>PRICE → MELODY</span></div><div><Activity size={14}/><span>VOLATILITY → TEMPO</span></div><div><BarChart3 size={14}/><span>VOLUME → DYNAMICS</span></div><div><Waves size={14}/><span>RSI → TENSION</span></div></div>
      </div>
    </section>
    <footer><a className="brand footer-brand" href="#"><span className="brand-mark"><AudioLines size={16}/></span>stock<span>2</span>sound</a><p>Not investment advice. Market data may be delayed or unavailable. Audio is an artistic interpretation of historical prices.</p><span>MADE FOR THE CURIOUS <span className="footer-star">✳</span></span></footer>
  </main>
}

createRoot(document.getElementById('root')).render(<App />)