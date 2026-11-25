'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Activity, ArrowDownRight, ArrowUpRight, AudioLines, BarChart3, ChevronDown, Download, GripVertical, Music2, Pause, Play, RefreshCw, Shuffle, Sparkles, Upload, Volume2, Waves, X } from 'lucide-react'
import { analyze, midiToHz, normalizeSeries, sampleSeries } from '../lib/marketMath'
import { composeStaffScore, LAYER_COLORS } from '../lib/staffScore'
import { createAmbienceBus, loadInstrumentSet, stopPlayers } from '../lib/instruments'
import StaffScoreView from './StaffScoreView'

const PERIOD_OPTIONS = [
  { value: '1d', label: '1 DAY', hint: '5-min bars' },
  { value: '5d', label: '1 WEEK', hint: '15-min bars' },
  { value: '1mo', label: '1 MONTH', hint: 'Daily bars' },
  { value: '3mo', label: '3 MONTHS', hint: 'Daily bars' },
  { value: '6mo', label: '6 MONTHS', hint: 'Daily bars' },
  { value: '1y', label: '1 YEAR', hint: 'Daily bars' },
  { value: '2y', label: '2 YEARS', hint: 'Daily bars' },
  { value: '5y', label: '5 YEARS', hint: 'Weekly bars' },
]

const PRESETS = {
  Adaptive: {
    wave: 'triangle',
    scale: [0, 2, 4, 7, 9, 11],
    bass: 'sine',
    beat: 0.28,
    legato: 1.8,
    instruments: ['acoustic_grand_piano', 'violin', 'flute', 'cello'],
    instrumentLabels: ['Piano', 'Violin', 'Flute', 'Cello'],
    bassInstrument: 'acoustic_bass',
  },
  Ambient: {
    wave: 'sine',
    scale: [0, 2, 3, 7, 9],
    bass: 'sine',
    beat: 0.4,
    legato: 2.2,
    instruments: ['pad_2_warm', 'flute', 'harp', 'cello'],
    instrumentLabels: ['Warm Pad', 'Flute', 'Harp', 'Cello'],
    bassInstrument: 'acoustic_bass',
  },
  Electronic: {
    wave: 'sawtooth',
    scale: [0, 2, 4, 7, 9, 11],
    bass: 'square',
    beat: 0.2,
    legato: 1.35,
    softDrums: true,
    instruments: ['lead_2_sawtooth', 'electric_piano_1', 'violin', 'flute'],
    instrumentLabels: ['Synth Lead', 'E-Piano', 'Violin', 'Flute'],
    bassInstrument: 'acoustic_bass',
  },
  Jazz: {
    wave: 'triangle',
    scale: [0, 3, 5, 7, 10],
    bass: 'sine',
    beat: 0.3,
    legato: 1.7,
    instruments: ['electric_piano_1', 'trumpet', 'clarinet', 'acoustic_bass'],
    instrumentLabels: ['E-Piano', 'Trumpet', 'Clarinet', 'Bass'],
    bassInstrument: 'acoustic_bass',
  },
  Cinematic: {
    wave: 'sine',
    scale: [0, 2, 5, 7, 9],
    bass: 'triangle',
    beat: 0.42,
    legato: 2.0,
    harmony: true,
    instruments: ['string_ensemble_1', 'french_horn', 'flute', 'choir_aahs'],
    instrumentLabels: ['Strings', 'Horn', 'Flute', 'Choir'],
    bassInstrument: 'cello',
  },
  Symphony: {
    wave: 'sine',
    scale: [0, 2, 4, 5, 7, 9, 11],
    bass: 'triangle',
    beat: 0.48,
    legato: 2.15,
    harmony: true,
    instruments: ['violin', 'viola', 'flute', 'french_horn'],
    instrumentLabels: ['Violin', 'Viola', 'Flute', 'Horn'],
    bassInstrument: 'cello',
  },
}

const STYLE_STORAGE_KEY = 'stock2sound.defaultStyle'
const MAX_SOURCES = 4

function readStoredDefaultStyle() {
  if (typeof window === 'undefined') return 'Adaptive'
  try {
    const stored = window.localStorage.getItem(STYLE_STORAGE_KEY)
    if (stored && PRESETS[stored]) return stored
  } catch {}
  return 'Adaptive'
}

function writeStoredDefaultStyle(next) {
  if (!PRESETS[next]) return
  try {
    window.localStorage.setItem(STYLE_STORAGE_KEY, next)
  } catch {}
}

async function fetchMarketPayload(symbol, range) {
  const response = await fetch(
    `/api/market?symbol=${encodeURIComponent(symbol)}&range=${encodeURIComponent(range)}`,
    { cache: 'no-store' },
  )
  const payload = await response.json().catch(() => ({}))
  return { response, payload }
}

export default function StockApp() {
  const [draftTicker, setDraftTicker] = useState('')
  const [period, setPeriod] = useState('3mo')
  const [style, setStyle] = useState('Adaptive')
  const [defaultStyle, setDefaultStyle] = useState('Adaptive')
  const [sources, setSources] = useState([])
  const [source, setSource] = useState('Waiting for market API…')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [volume, setVolume] = useState(100)
  const [suggestions, setSuggestions] = useState([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [highlightIndex, setHighlightIndex] = useState(-1)
  const [searching, setSearching] = useState(false)
  const [draggingSymbol, setDraggingSymbol] = useState(null)
  const [dropTargetIndex, setDropTargetIndex] = useState(null)
  const [periodOpen, setPeriodOpen] = useState(false)
  const [loadingInstruments, setLoadingInstruments] = useState(false)
  const audioRef = useRef(null)
  const timerRef = useRef(null)
  const oscillatorsRef = useRef([])
  const playersRef = useRef({})
  const masterRef = useRef(null)
  const ambienceRef = useRef(null)
  const playGenRef = useRef(0)
  const requestIdRef = useRef(0)
  const searchRequestRef = useRef(0)
  const tickerWrapRef = useRef(null)
  const periodWrapRef = useRef(null)
  const skipSearchRef = useRef(false)
  const sourcesRef = useRef(sources)
  const periodLabel = PERIOD_OPTIONS.find((option) => option.value === period)?.label || '3 MONTHS'
  const preset = PRESETS[style]
  const hasData = sources.some((item) => item.rows.length >= 3)
  const analysis = useMemo(() => {
    if (!sources.length) return analyze([])
    if (sources.length === 1) return analyze(sources[0].rows)
    const volatilities = sources.map((item) => analyze(item.rows).volatility)
    const changes = sources.map((item) => analyze(item.rows).change)
    const rsis = sources.map((item) => analyze(item.rows).rsi)
    const upDays = sources.map((item) => analyze(item.rows).upDays)
    const totalDays = sources.map((item) => analyze(item.rows).totalDays)
    return {
      first: 0,
      last: 0,
      change: changes.reduce((a, b) => a + b, 0) / changes.length,
      volatility: volatilities.reduce((a, b) => a + b, 0) / volatilities.length,
      upDays: Math.round(upDays.reduce((a, b) => a + b, 0) / upDays.length),
      totalDays: Math.round(totalDays.reduce((a, b) => a + b, 0) / totalDays.length),
      avgVolume: 0,
      rsi: rsis.reduce((a, b) => a + b, 0) / rsis.length,
    }
  }, [sources])
  const staffScore = useMemo(
    () => (hasData ? composeStaffScore(sources, preset, { noteCount: 48, maxSources: MAX_SOURCES }) : null),
    [hasData, sources, preset],
  )
  const ensembleLabel = sources.length ? sources.map((item) => item.symbol).join(' + ') : '—'
  const isComposite = sources.length > 1

  useEffect(() => {
    sourcesRef.current = sources
  }, [sources])

  useEffect(() => () => stopMusic(), [])

  useEffect(() => {
    const stored = readStoredDefaultStyle()
    setStyle(stored)
    setDefaultStyle(stored)
  }, [])

  useEffect(() => {
    addOrReplaceSource('NVDA', period, { replaceAll: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function chooseStyle(next) {
    if (!PRESETS[next]) return
    setStyle(next)
    stopMusic()
  }

  function saveDefaultStyle(next = style) {
    if (!PRESETS[next]) return
    writeStoredDefaultStyle(next)
    setDefaultStyle(next)
    setStyle(next)
    stopMusic()
  }

  useEffect(() => {
    function eventTargetElement(event) {
      const target = event.target
      if (target instanceof Element) return target
      return target?.parentElement || null
    }

    function onPointerDown(event) {
      const target = eventTargetElement(event)
      if (!target) return
      if (!tickerWrapRef.current?.contains(target)) {
        setShowSuggestions(false)
        setHighlightIndex(-1)
      }
      if (!periodWrapRef.current?.contains(target)) {
        setPeriodOpen(false)
      }
    }
    function onKeyDown(event) {
      if (event.key === 'Escape') {
        setPeriodOpen(false)
        setShowSuggestions(false)
        setHighlightIndex(-1)
      }
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('mousedown', onPointerDown, true)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('mousedown', onPointerDown, true)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [])

  function closePeriodMenu() {
    setPeriodOpen(false)
  }

  function closeSuggestions() {
    setShowSuggestions(false)
    setHighlightIndex(-1)
  }

  function choosePeriod(next) {
    setPeriod(next)
    setPeriodOpen(false)
    reloadAllSources(next)
  }

  useEffect(() => {
    if (skipSearchRef.current) {
      skipSearchRef.current = false
      return
    }

    const query = draftTicker.trim()
    if (query.length < 1) {
      setSuggestions([])
      setShowSuggestions(false)
      setSearching(false)
      return
    }

    const requestId = ++searchRequestRef.current
    const timer = setTimeout(async () => {
      setSearching(true)
      try {
        const response = await fetch(`/api/ticker-search?q=${encodeURIComponent(query)}`, { cache: 'no-store' })
        const payload = await response.json().catch(() => ({ results: [] }))
        if (requestId !== searchRequestRef.current) return
        const results = Array.isArray(payload.results) ? payload.results : []
        setSuggestions(results)
        setShowSuggestions(results.length > 0)
        setHighlightIndex(results.length ? 0 : -1)
      } catch {
        if (requestId !== searchRequestRef.current) return
        setSuggestions([])
        setShowSuggestions(false)
      } finally {
        if (requestId === searchRequestRef.current) setSearching(false)
      }
    }, 220)

    return () => clearTimeout(timer)
  }, [draftTicker])

  function friendlyLoadError(payload, fallback) {
    if (payload?.code === 'ticker_not_found' || payload?.code === 'invalid_symbol') {
      return payload.error
    }
    const message = payload?.error || fallback
    if (/http\s*404|not found|delisted|nonexistent|couldn't find|could not find/i.test(message)) {
      return message.includes('ticker') ? message : `We couldn't find that ticker. It may be incorrect or nonexistent.`
    }
    return `${message} If you have a spreadsheet of prices, you can import a CSV instead.`
  }

  async function addOrReplaceSource(nextTicker, nextPeriod = period, options = {}) {
    const symbol = String(nextTicker || '').trim().toUpperCase()
    if (!symbol) return

    const current = sourcesRef.current
    const replaceAll = Boolean(options.replaceAll)
    const alreadyPresent = current.some((item) => item.symbol === symbol)

    if (!replaceAll && alreadyPresent) {
      setError(`${symbol} is already in your composite.`)
      setShowSuggestions(false)
      return
    }

    if (!replaceAll && current.length >= MAX_SOURCES) {
      setError(`You can layer up to ${MAX_SOURCES} tickers. Remove one to add another.`)
      return
    }

    const requestId = ++requestIdRef.current
    setLoading(true)
    setError('')
    setShowSuggestions(false)
    setHighlightIndex(-1)
    setSource(`Fetching ${symbol} from market API…`)

    try {
      const { response, payload } = await fetchMarketPayload(symbol, nextPeriod)
      if (requestId !== requestIdRef.current) return
      if (!response.ok) {
        throw Object.assign(new Error(friendlyLoadError(payload, 'We could not load market data.')), { payload })
      }
      if (!Array.isArray(payload.rows) || payload.rows.length < 3) {
        throw new Error('Not enough price history to compose music for that ticker.')
      }

      const nextSource = {
        symbol: payload.symbol || symbol,
        rows: payload.rows,
        exchange: payload.exchange || '',
        currency: payload.currency || 'USD',
        provider: payload.source || 'Market API',
        granularity: payload.granularity || payload.interval || '',
      }

      const nextSources = replaceAll ? [nextSource] : [...current.filter((item) => item.symbol !== nextSource.symbol), nextSource]
      setSources(nextSources)
      skipSearchRef.current = true
      setDraftTicker('')
      setSuggestions([])
      setSource(
        nextSources.length > 1
          ? `Composite · ${nextSources.map((item) => item.symbol).join(' + ')} · ${nextSource.provider}`
          : `${nextSource.provider} · ${nextSource.exchange || 'exchange'} · ${nextSource.currency}`,
      )
      setProgress(0)
      stopMusic()
    } catch (e) {
      if (requestId !== requestIdRef.current) return
      setError(e.payload ? friendlyLoadError(e.payload, e.message) : e.message)
      if (!sourcesRef.current.length) setSource('No market data loaded')
    } finally {
      if (requestId === requestIdRef.current) setLoading(false)
    }
  }

  async function reloadAllSources(nextPeriod = period) {
    const current = sourcesRef.current
    if (!current.length) {
      await addOrReplaceSource(draftTicker || 'NVDA', nextPeriod, { replaceAll: true })
      return
    }

    const requestId = ++requestIdRef.current
    setLoading(true)
    setError('')
    setSource(`Refreshing ${current.map((item) => item.symbol).join(', ')}…`)

    try {
      const results = await Promise.all(
        current.map(async (item) => {
          const { response, payload } = await fetchMarketPayload(item.symbol, nextPeriod)
          if (!response.ok) {
            throw Object.assign(new Error(friendlyLoadError(payload, `We could not refresh ${item.symbol}.`)), { payload })
          }
          if (!Array.isArray(payload.rows) || payload.rows.length < 3) {
            throw new Error(`Not enough price history for ${item.symbol}.`)
          }
          return {
            symbol: payload.symbol || item.symbol,
            rows: payload.rows,
            exchange: payload.exchange || item.exchange || '',
            currency: payload.currency || item.currency || 'USD',
            provider: payload.source || item.provider || 'Market API',
            granularity: payload.granularity || payload.interval || item.granularity || '',
          }
        }),
      )
      if (requestId !== requestIdRef.current) return
      setSources(results)
      setSource(
        results.length > 1
          ? `Composite · ${results.map((item) => item.symbol).join(' + ')} · Market API`
          : `${results[0].provider} · ${results[0].exchange || 'exchange'} · ${results[0].currency}`,
      )
      setProgress(0)
      stopMusic()
    } catch (e) {
      if (requestId !== requestIdRef.current) return
      setError(e.payload ? friendlyLoadError(e.payload, e.message) : e.message)
    } finally {
      if (requestId === requestIdRef.current) setLoading(false)
    }
  }

  function describeSources(next) {
    if (!next.length) return 'No market data loaded'
    const grain = next[0]?.granularity ? ` · ${next[0].granularity} bars` : ''
    if (next.length === 1) {
      return `${next[0].provider} · ${next[0].exchange || 'exchange'} · ${next[0].currency}${grain}`
    }
    return `Composite · lead ${next[0].symbol} · ${next.map((item) => item.symbol).join(' + ')} · Market API${grain}`
  }

  function commitSourceOrder(next) {
    setSources(next)
    setSource(describeSources(next))
    setProgress(0)
    stopMusic()
  }

  function removeSource(symbol) {
    commitSourceOrder(sourcesRef.current.filter((item) => item.symbol !== symbol))
  }

  function reorderSource(fromSymbol, toIndex) {
    const current = [...sourcesRef.current]
    const fromIndex = current.findIndex((item) => item.symbol === fromSymbol)
    if (fromIndex < 0 || toIndex < 0 || toIndex >= current.length || fromIndex === toIndex) return
    const [item] = current.splice(fromIndex, 1)
    current.splice(toIndex, 0, item)
    commitSourceOrder(current)
  }

  function shuffleSources() {
    const current = [...sourcesRef.current]
    if (current.length < 2) return
    const previous = current.map((item) => item.symbol).join('|')
    for (let attempt = 0; attempt < 6; attempt++) {
      for (let i = current.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[current[i], current[j]] = [current[j], current[i]]
      }
      if (current.map((item) => item.symbol).join('|') !== previous) break
    }
    commitSourceOrder(current)
  }

  function chooseSuggestion(suggestion) {
    const symbol = suggestion.symbol
    skipSearchRef.current = true
    setDraftTicker('')
    setSuggestions([])
    setShowSuggestions(false)
    setHighlightIndex(-1)
    addOrReplaceSource(symbol, period)
  }

  function importCsv(event) {
    const file = event.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const lines = String(reader.result).trim().split(/\r?\n/)
        const headers = lines.shift().split(',').map((x) => x.trim().toLowerCase().replaceAll('"', ''))
        const dateIndex = headers.findIndex((x) => x.includes('date') || x.includes('time'))
        const closeIndex = headers.findIndex((x) => ['close', 'adj close', 'adj_close', 'price'].includes(x))
        const volumeIndex = headers.findIndex((x) => x.includes('volume'))
        if (closeIndex < 0) throw new Error('CSV needs a Close or Price column.')
        const parsed = lines
          .map((line) => {
            const cells = line.split(',').map((x) => x.trim().replaceAll('"', ''))
            return {
              date: dateIndex >= 0 ? cells[dateIndex] : '',
              close: Number(cells[closeIndex]),
              volume: volumeIndex >= 0 ? Number(cells[volumeIndex]) : 0,
            }
          })
          .filter((x) => Number.isFinite(x.close))
        if (parsed.length < 3) throw new Error('CSV needs at least three valid price rows.')
        const symbol = file.name.replace(/\.csv$/i, '').slice(0, 12).toUpperCase() || 'CSV'
        setSources([
          {
            symbol,
            rows: parsed,
            exchange: 'CSV',
            currency: '',
            provider: file.name,
          },
        ])
        setSource(file.name)
        setError('')
        setProgress(0)
        stopMusic()
      } catch (e) {
        setError(e.message)
      }
    }
    reader.readAsText(file)
    event.target.value = ''
  }

  function stopMusic() {
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = null
    stopPlayers(playersRef.current)
    oscillatorsRef.current.forEach((o) => {
      try {
        o.stop()
      } catch {}
    })
    oscillatorsRef.current = []
    setPlaying(false)
  }

  async function playMusic() {
    if (playing || loadingInstruments) {
      playGenRef.current += 1
      stopMusic()
      setLoadingInstruments(false)
      return
    }
    const score = staffScore || composeStaffScore(sources, preset, { noteCount: 48, maxSources: MAX_SOURCES })
    if (!score?.voices?.length) {
      setError('Add at least one ticker before playing.')
      return
    }
    const AudioContextClass = window.AudioContext || window.webkitAudioContext
    if (!AudioContextClass) {
      setError('Your browser does not support Web Audio. Try the latest Chrome, Safari or Firefox.')
      return
    }

    const playId = ++playGenRef.current
    const ctx = audioRef.current || new AudioContextClass()
    audioRef.current = ctx
    if (ctx.state === 'suspended') await ctx.resume()
    if (playId !== playGenRef.current) return

    const master = ctx.createGain()
    master.gain.value = (volume / 100) * 7.2
    master.connect(ctx.destination)
    masterRef.current = master

    const ambience = createAmbienceBus(ctx, master)
    ambienceRef.current = ambience

    const {
      voices,
      secondsPerNote,
      noteDuration,
      noteCount,
      tonicMidi,
      harmony,
      softDrums,
      bassInstrument,
      volatilityFactor,
    } = score
    const lead = voices[0]
    const gainScale = 1.8 / Math.sqrt(voices.length)
    const duration = noteCount * secondsPerNote
    const needed = [...voices.map((voice) => voice.instrument), bassInstrument]

    setLoadingInstruments(true)
    setError('')
    try {
      const players = await loadInstrumentSet(ctx, needed, ambience)
      if (playId !== playGenRef.current) return
      playersRef.current = players

      const startAt = ctx.currentTime + 0.08
      for (let i = 0; i < noteCount; i++) {
        const time = startAt + i * secondsPerNote

        voices.forEach((voice) => {
          const note = voice.notes[i]
          const player = players[voice.instrument]
          if (!note || !player) return
          player.play(note.midi, time, {
            duration: noteDuration,
            gain: Math.min(4.8, note.velocity * 1.7 * gainScale),
          })

          if (harmony && voice === lead) {
            player.play(note.midi + 7, time + 0.02, {
              duration: noteDuration * 1.05,
              gain: Math.min(3.6, note.velocity * 0.7 * gainScale),
            })
          }
        })

        const bassPlayer = players[bassInstrument]
        if (bassPlayer && i % 2 === 0) {
          bassPlayer.play(tonicMidi - 12 + (lead.metrics.change > 0 ? 0 : -2), time, {
            duration: noteDuration * 0.9,
            gain: 1.8,
          })
        }

        // Keep percussion subtle and only for Electronic so acoustic ensembles stay musical.
        if (softDrums) {
          const drumEvery = Math.max(3, Math.round(6 / volatilityFactor))
          if (i % drumEvery === 0) {
            const drum = ctx.createOscillator()
            const drumGain = ctx.createGain()
            drum.type = 'sine'
            drum.frequency.setValueAtTime(90, time)
            drum.frequency.exponentialRampToValueAtTime(46, time + 0.12)
            drumGain.gain.setValueAtTime(0.0001, time)
            drumGain.gain.linearRampToValueAtTime(0.72, time + 0.008)
            drumGain.gain.exponentialRampToValueAtTime(0.0001, time + 0.14)
            drum.connect(drumGain)
            drumGain.connect(ambience)
            drum.start(time)
            drum.stop(time + 0.15)
            oscillatorsRef.current.push(drum)
          }
        }
      }

      setPlaying(true)
      setProgress(0)
      const started = Date.now()
      timerRef.current = setInterval(() => {
        const p = Math.min(100, ((Date.now() - started) / (duration * 1000)) * 100)
        setProgress(p)
        if (p >= 100) stopMusic()
      }, 80)
    } catch (e) {
      if (playId === playGenRef.current) {
        setError('Could not load instrument samples. Check your network and try again.')
        stopMusic()
      }
    } finally {
      if (playId === playGenRef.current) setLoadingInstruments(false)
    }
  }

  function downloadWav() {
    const score = staffScore || composeStaffScore(sources, preset, { noteCount: 48, maxSources: MAX_SOURCES })
    if (!score?.voices?.length) {
      setError('Add at least one ticker before exporting audio.')
      return
    }
    const sampleRate = 44100
    const { voices, secondsPerNote, noteCount, tonicMidi } = score
    const length = Math.floor(noteCount * secondsPerNote * sampleRate)
    const buffer = new ArrayBuffer(44 + length * 2)
    const view = new DataView(buffer)
    const write = (offset, text) => [...text].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)))
    write(0, 'RIFF')
    view.setUint32(4, 36 + length * 2, true)
    write(8, 'WAVE')
    write(12, 'fmt ')
    view.setUint32(16, 16, true)
    view.setUint16(20, 1, true)
    view.setUint16(22, 1, true)
    view.setUint32(24, sampleRate, true)
    view.setUint32(28, sampleRate * 2, true)
    view.setUint16(32, 2, true)
    view.setUint16(34, 16, true)
    write(36, 'data')
    view.setUint32(40, length * 2, true)
    const voiceGain = 4.4 / Math.sqrt(voices.length)
    for (let i = 0; i < length; i++) {
      const t = i / sampleRate
      const index = Math.min(noteCount - 1, Math.floor(t / secondsPerNote))
      const local = (t % secondsPerNote) / secondsPerNote
      const envelope = Math.min(1, local * 18) * Math.max(0, 1 - local) ** 1.4
      let sample = 0
      voices.forEach((voice) => {
        const note = voice.notes[index]
        if (!note) return
        sample += Math.sin(2 * Math.PI * midiToHz(note.midi) * t) * envelope * voiceGain * note.velocity
      })
      sample += Math.sin(2 * Math.PI * midiToHz(tonicMidi - 12) * t) * envelope * 1.28
      sample = Math.max(-1, Math.min(1, sample))
      view.setInt16(44 + i * 2, sample * 32767, true)
    }
    const blob = new Blob([buffer], { type: 'audio/wav' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    const slug = sources.map((item) => item.symbol.toLowerCase()).join('-') || 'ensemble'
    link.download = `stock2sound-${slug}-${period}.wav`
    link.click()
    URL.revokeObjectURL(link.href)
  }

  const changePositive = analysis.change >= 0
  const chartLayers = useMemo(() => {
    const maxPoints = 180
    return sources.map((item, index) => {
      const sampled = sampleSeries(item.rows, maxPoints)
      const normalized = normalizeSeries(sampled)
      const points = normalized
        .map((point, i) => `${(i / Math.max(1, normalized.length - 1)) * 100},${92 - point.norm * 78}`)
        .join(' ')
      return {
        symbol: item.symbol,
        color: LAYER_COLORS[index % LAYER_COLORS.length],
        points,
        firstDate: sampled[0]?.date || '—',
        lastDate: sampled.at(-1)?.date || '—',
      }
    })
  }, [sources])

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#">
          <span className="brand-mark">
            <AudioLines size={19} />
          </span>
          stock<span>2</span>sound
        </a>
        <div className="topbar-right">
          <span className="live-dot"></span>
          <span>MARKET API → MUSIC</span>
          <a href="https://github.com/susanmu2020/Stock2Sound" target="_blank" rel="noreferrer">
            GitHub <span>↗</span>
          </a>
        </div>
      </header>

      <section className="hero">
        <div className="eyebrow">
          <Sparkles size={13} /> YOUR PORTFOLIO, REIMAGINED
        </div>
        <h1>
          Hear the <em>market.</em>
        </h1>
        <p className="hero-copy">Layer multiple tickers into one track. Each symbol becomes a voice in the composition.</p>
        <div className="hero-wave">
          {Array.from({ length: 40 }).map((_, i) => (
            <span key={i}></span>
          ))}
        </div>
      </section>

      <section className="workspace">
        <div className="section-head">
          <div>
            <span className="step">01</span>
            <h2>Choose your markets</h2>
          </div>
          <span className="muted">COMPOSITE UP TO {MAX_SOURCES}</span>
        </div>
        <div className="control-panel">
          <div className="ticker-control">
            <label htmlFor="ticker">ADD TICKER</label>
            <div className="ticker-wrap" ref={tickerWrapRef}>
              <div className={`ticker-input${showSuggestions ? ' open' : ''}`}>
                <span>$</span>
                <input
                  id="ticker"
                  value={draftTicker}
                  autoComplete="off"
                  spellCheck={false}
                  aria-autocomplete="list"
                  aria-expanded={showSuggestions}
                  aria-controls="ticker-suggestions"
                  onChange={(e) => setDraftTicker(e.target.value.toUpperCase())}
                  onFocus={() => {
                    if (suggestions.length) setShowSuggestions(true)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowDown') {
                      if (!suggestions.length) return
                      e.preventDefault()
                      setShowSuggestions(true)
                      setHighlightIndex((index) => (index + 1) % suggestions.length)
                      return
                    }
                    if (e.key === 'ArrowUp') {
                      if (!suggestions.length) return
                      e.preventDefault()
                      setShowSuggestions(true)
                      setHighlightIndex((index) => (index <= 0 ? suggestions.length - 1 : index - 1))
                      return
                    }
                    if (e.key === 'Escape') {
                      setShowSuggestions(false)
                      setHighlightIndex(-1)
                      return
                    }
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      if (showSuggestions && highlightIndex >= 0 && suggestions[highlightIndex]) {
                        chooseSuggestion(suggestions[highlightIndex])
                      } else {
                        addOrReplaceSource(draftTicker, period)
                      }
                    }
                  }}
                  placeholder="AAPL, MSFT…"
                  maxLength={18}
                />
                <button
                  className="fetch-btn"
                  onClick={() => addOrReplaceSource(draftTicker, period)}
                  disabled={loading || !draftTicker.trim()}
                >
                  {loading ? <RefreshCw className="spin" size={15} /> : <Activity size={15} />} {loading ? 'LOADING' : 'ADD'}
                </button>
              </div>
              {showSuggestions && (
                <>
                  <button type="button" className="menu-backdrop" aria-label="Close suggestions" onClick={closeSuggestions} />
                  <ul id="ticker-suggestions" className="ticker-suggestions" role="listbox">
                    {suggestions.map((suggestion, index) => (
                      <li key={`${suggestion.symbol}-${suggestion.exchange}`}>
                        <button
                          type="button"
                          role="option"
                          aria-selected={index === highlightIndex}
                          className={index === highlightIndex ? 'active' : ''}
                          onMouseEnter={() => setHighlightIndex(index)}
                          onClick={() => chooseSuggestion(suggestion)}
                        >
                          <span className="suggestion-symbol">{suggestion.symbol}</span>
                          <span className="suggestion-meta">
                            <span className="suggestion-name">{suggestion.name}</span>
                            <span className="suggestion-exchange">
                              {suggestion.type}
                              {suggestion.exchange ? ` · ${suggestion.exchange}` : ''}
                            </span>
                          </span>
                        </button>
                      </li>
                    ))}
                    {searching && <li className="suggestion-status">Searching…</li>}
                  </ul>
                </>
              )}
            </div>
          </div>
          <div className="period-control">
            <span className="period-label" id="period-label">TIME RANGE</span>
            <div className="period-wrap" ref={periodWrapRef}>
              <button
                type="button"
                id="period"
                className={`period-trigger${periodOpen ? ' open' : ''}`}
                aria-haspopup="listbox"
                aria-expanded={periodOpen}
                aria-labelledby="period-label"
                onClick={() => setPeriodOpen((open) => !open)}
              >
                <span>{periodLabel}</span>
                <ChevronDown size={15} className={periodOpen ? 'chevron open' : 'chevron'} />
              </button>
              {periodOpen && (
                <>
                  <button type="button" className="menu-backdrop" aria-label="Close time range menu" onClick={closePeriodMenu} />
                  <ul className="period-menu" role="listbox" aria-labelledby="period-label">
                    {PERIOD_OPTIONS.map((option) => (
                      <li key={option.value}>
                        <button
                          type="button"
                          role="option"
                          aria-selected={period === option.value}
                          className={period === option.value ? 'selected' : ''}
                          onClick={() => choosePeriod(option.value)}
                        >
                          <span className="period-option-label">{option.label}</span>
                          {option.hint && <span className="period-option-hint">{option.hint}</span>}
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          </div>
          <label className="upload-btn">
            <Upload size={15} /> IMPORT CSV
            <input type="file" accept=".csv,text/csv" onChange={importCsv} />
          </label>
        </div>

        <div className="source-chips-row">
          <div className="source-chips">
            {sources.length === 0 ? (
              <span className="chip-empty">No tickers yet — add one to start composing.</span>
            ) : (
              sources.map((item, index) => (
                <div
                  key={item.symbol}
                  className={[
                    'source-chip',
                    index === 0 ? 'is-lead' : '',
                    draggingSymbol === item.symbol ? 'is-dragging' : '',
                    dropTargetIndex === index && draggingSymbol && draggingSymbol !== item.symbol ? 'is-drop-target' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  style={{ '--chip': LAYER_COLORS[index % LAYER_COLORS.length] }}
                  draggable={sources.length > 1}
                  onDragStart={(event) => {
                    if (sources.length < 2) return
                    event.dataTransfer.effectAllowed = 'move'
                    event.dataTransfer.setData('text/plain', item.symbol)
                    setDraggingSymbol(item.symbol)
                    setDropTargetIndex(index)
                  }}
                  onDragOver={(event) => {
                    if (!draggingSymbol || draggingSymbol === item.symbol) return
                    event.preventDefault()
                    event.dataTransfer.dropEffect = 'move'
                    if (dropTargetIndex !== index) setDropTargetIndex(index)
                  }}
                  onDrop={(event) => {
                    event.preventDefault()
                    const symbol = event.dataTransfer.getData('text/plain') || draggingSymbol
                    if (symbol) reorderSource(symbol, index)
                    setDraggingSymbol(null)
                    setDropTargetIndex(null)
                  }}
                  onDragEnd={() => {
                    setDraggingSymbol(null)
                    setDropTargetIndex(null)
                  }}
                >
                  {sources.length > 1 && (
                    <span className="chip-handle" aria-hidden="true" title="Drag to reorder">
                      <GripVertical size={14} />
                    </span>
                  )}
                  <span className="chip-swatch" />
                  <span className="chip-symbol">{item.symbol}</span>
                  <span className="chip-role">
                    {index === 0 ? 'LEAD' : `VOICE ${index + 1}`}
                    {staffScore?.voices?.[index]?.instrumentLabel ? ` · ${staffScore.voices[index].instrumentLabel}` : ''}
                  </span>
                  <button
                    type="button"
                    aria-label={`Remove ${item.symbol}`}
                    onClick={() => removeSource(item.symbol)}
                    onMouseDown={(event) => event.stopPropagation()}
                  >
                    <X size={13} />
                  </button>
                </div>
              ))
            )}
          </div>
          {sources.length > 1 && (
            <button type="button" className="shuffle-btn" onClick={shuffleSources} title="Randomize voice order">
              <Shuffle size={14} /> Random order
            </button>
          )}
        </div>
        {sources.length > 1 && (
          <div className="reorder-hint">Drag chips to reorder — first position is the lead melody/bass.</div>
        )}

        {error && <div className="error-message">{error}</div>}
        <div className="data-source">
          <span className="source-dot"></span> {source} <span>·</span> {sources.reduce((sum, item) => sum + item.rows.length, 0)} data points
          {loading && <span className="loading-hint"> · refreshing</span>}
        </div>

        <div className="section-head market-heading">
          <div>
            <span className="step">02</span>
            <h2>Read the rhythm</h2>
          </div>
          <span className="muted">{isComposite ? 'NORMALIZED OVERLAY' : 'MARKET DNA'}</span>
        </div>
        <div className="market-grid">
          <div className="chart-card">
            <div className="card-top">
              <div>
                <span className="tiny-label">{isComposite ? 'COMPOSITE MOVEMENT' : 'PRICE MOVEMENT'}</span>
                <div className="price-title">
                  {ensembleLabel}{' '}
                  {hasData ? (
                    <span className={changePositive ? 'positive' : 'negative'}>
                      {changePositive ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />} {analysis.change >= 0 ? '+' : ''}
                      {analysis.change.toFixed(2)}%{isComposite ? ' avg' : ''}
                    </span>
                  ) : (
                    <span className="positive">{loading ? 'Loading…' : 'No data'}</span>
                  )}
                </div>
              </div>
              <BarChart3 size={18} className="subtle-icon" />
            </div>
            <div className="chart-wrap">
              {hasData ? (
                <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="chart-svg">
                  <defs>
                    <linearGradient id="area" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0%" stopColor="#c7f36b" stopOpacity=".18" />
                      <stop offset="100%" stopColor="#c7f36b" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <line x1="0" y1="20" x2="100" y2="20" className="gridline" />
                  <line x1="0" y1="50" x2="100" y2="50" className="gridline" />
                  <line x1="0" y1="80" x2="100" y2="80" className="gridline" />
                  {chartLayers.length === 1 && (
                    <polygon points={`0,100 ${chartLayers[0].points} 100,100`} fill="url(#area)" />
                  )}
                  {chartLayers.map((layer) => (
                    <polyline
                      key={layer.symbol}
                      points={layer.points}
                      fill="none"
                      stroke={layer.color}
                      strokeWidth={chartLayers.length === 1 ? 1.5 : 1.35}
                      vectorEffect="non-scaling-stroke"
                      strokeLinejoin="round"
                      strokeLinecap="round"
                      opacity={chartLayers.length === 1 ? 1 : 0.92}
                    />
                  ))}
                </svg>
              ) : (
                <div className="empty-chart">{loading ? 'Pulling live prices from the market API…' : 'Add a ticker to load market data.'}</div>
              )}
            </div>
            <div className="chart-foot">
              <span>{chartLayers[0]?.firstDate || '—'}</span>
              <span className="chart-legend">
                {chartLayers.map((layer) => (
                  <span key={layer.symbol} className="legend-item">
                    <i style={{ background: layer.color }} />
                    {layer.symbol}
                  </span>
                ))}
              </span>
              <span>{chartLayers[0]?.lastDate || '—'}</span>
            </div>
          </div>
          <div className="metrics-card">
            <div className="metric">
              <span>{isComposite ? 'AVG VOLATILITY' : 'VOLATILITY'}</span>
              <strong>
                {hasData ? analysis.volatility.toFixed(2) : '—'}
                <small>%</small>
              </strong>
              <div className="metric-bar">
                <i style={{ width: `${hasData ? Math.min(100, analysis.volatility * 12) : 0}%` }} />
              </div>
            </div>
            <div className="metric">
              <span>{isComposite ? 'AVG RSI · 14' : 'RSI · 14'}</span>
              <strong>
                {hasData ? analysis.rsi.toFixed(0) : '—'}
                <small>/ 100</small>
              </strong>
              <div className="metric-bar">
                <i style={{ width: `${hasData ? analysis.rsi : 0}%` }} />
              </div>
            </div>
            <div className="metric">
              <span>{isComposite ? 'VOICES' : 'UP DAYS'}</span>
              <strong>
                {hasData ? (isComposite ? sources.length : analysis.upDays) : '—'}
                <small>{isComposite ? ` / ${MAX_SOURCES}` : ` / ${hasData ? analysis.totalDays : '—'}`}</small>
              </strong>
              <div className="metric-bar">
                <i
                  style={{
                    width: `${
                      hasData
                        ? isComposite
                          ? (sources.length / MAX_SOURCES) * 100
                          : (analysis.upDays / Math.max(1, analysis.totalDays)) * 100
                        : 0
                    }%`,
                  }}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="section-head staff-heading">
          <div>
            <span className="step">03</span>
            <h2>Map to the staff</h2>
          </div>
          <span className="muted">PRICE → NOTES</span>
        </div>
        <div className="staff-card">
          <div className="card-top staff-card-top">
            <div>
              <span className="tiny-label">STAFF SCORE</span>
              <div className="price-title">{hasData ? 'Line contour as notation' : 'Waiting for prices'}</div>
            </div>
            <Music2 size={18} className="subtle-icon" />
          </div>
          <StaffScoreView score={staffScore} progress={progress} />
          <p className="staff-explain">
            Each close becomes a staff note, then a sampled instrument plays it (piano, violin, flute, and more by vibe). Notes overlap
            with light room ambience so phrases feel continuous instead of robotic beeps.
          </p>
        </div>

        <div className="section-head music-heading">
          <div>
            <span className="step">04</span>
            <h2>Make it music</h2>
          </div>
          <span className="muted">STAFF → AUDIO</span>
        </div>
        <div className="music-card">
          <div className="music-card-top">
            <div>
              <div className="tiny-label">SOUND PROFILE</div>
              <h3>
                {style === 'Adaptive' ? 'Adaptive' : style} {isComposite ? 'ensemble' : 'composition'}
              </h3>
              <p>
                Built from {ensembleLabel} · {(preset.instrumentLabels || []).slice(0, Math.max(1, sources.length)).join(' / ') || 'instruments'} ·{' '}
                {hasData ? `${analysis.volatility.toFixed(1)}%` : '—'} volatility
              </p>
            </div>
            <div className="music-icon">
              <Waves size={23} />
            </div>
          </div>
          <div className="style-picker">
            <div className="style-picker-head">
              <span>CHOOSE A VIBE</span>
              <span className="default-vibe-note">Default: {defaultStyle}</span>
            </div>
            <div className="style-options">
              {Object.keys(PRESETS).map((s) => (
                <button
                  key={s}
                  onClick={() => chooseStyle(s)}
                  className={`${style === s ? 'selected' : ''}${defaultStyle === s ? ' is-default' : ''}`}
                  title={defaultStyle === s ? `${s} is your saved default` : `Use ${s}`}
                >
                  {(s === 'Adaptive' || s === 'Symphony') && <Sparkles size={12} />} {s}
                  {defaultStyle === s && <span className="default-pill">DEFAULT</span>}
                </button>
              ))}
            </div>
            <div className="default-style-row">
              {style === defaultStyle ? (
                <span className="default-saved">Using your saved default · kept across refresh and ticker changes</span>
              ) : (
                <button type="button" className="default-style-btn" onClick={() => saveDefaultStyle(style)}>
                  Set {style} as my default
                </button>
              )}
            </div>
          </div>
          <div className="instrument-strip">
            {(staffScore?.voices || []).map((voice) => (
              <span key={`${voice.symbol}-${voice.instrument}`} className="instrument-pill" style={{ '--chip': voice.color }}>
                <i />
                {voice.symbol} → {voice.instrumentLabel}
              </span>
            ))}
          </div>
          <div className="player">
            <button className="play-button" onClick={playMusic} disabled={!hasData || loadingInstruments}>
              {loadingInstruments ? <RefreshCw className="spin" size={21} /> : playing ? <Pause size={21} fill="currentColor" /> : <Play size={21} fill="currentColor" />}
            </button>
            <div className="player-main">
              <div className="player-meta">
                <strong>
                  {loadingInstruments
                    ? 'Loading instruments…'
                    : playing
                      ? 'Now playing'
                      : hasData
                        ? isComposite
                          ? 'Ready to composite'
                          : 'Ready to compose'
                        : 'Waiting for market data'}
                </strong>
                <span>
                  {loadingInstruments
                    ? 'FETCHING PIANO / STRINGS / WINDS'
                    : playing
                      ? isComposite
                        ? `${sources.length} INSTRUMENTS LIVE`
                        : 'SAMPLED INSTRUMENTS'
                      : hasData
                        ? 'PRESS PLAY TO GENERATE'
                        : 'ADD A TICKER FIRST'}
                </span>
              </div>
              <div className="progress-track">
                <i style={{ width: `${progress}%` }} />
              </div>
            </div>
            <div className="volume-control">
              <Volume2 size={15} />
              <input
                aria-label="Volume"
                type="range"
                min="0"
                max="100"
                value={volume}
                onChange={(e) => {
                  setVolume(Number(e.target.value))
                  if (masterRef.current) masterRef.current.gain.value = (Number(e.target.value) / 100) * 7.2
                }}
              />
            </div>
            <button className="download-button" onClick={downloadWav} disabled={!hasData}>
              <Download size={16} />
              <span>WAV</span>
            </button>
          </div>
          <div className="mapping-note">
            <div>
              <BarChart3 size={14} />
              <span>PRICE → STAFF</span>
            </div>
            <div>
              <Music2 size={14} />
              <span>STAFF → INSTRUMENTS</span>
            </div>
            <div>
              <Activity size={14} />
              <span>LEGATO + ROOM</span>
            </div>
            <div>
              <Waves size={14} />
              <span>NOTES → AUDIO</span>
            </div>
          </div>
        </div>
      </section>
      <footer>
        <a className="brand footer-brand" href="#">
          <span className="brand-mark">
            <AudioLines size={16} />
          </span>
          stock<span>2</span>sound
        </a>
        <p>Not investment advice. Market data may be delayed or unavailable. Audio is an artistic interpretation of historical prices.</p>
        <span>
          MADE FOR THE CURIOUS <span className="footer-star">✳</span>
        </span>
      </footer>
    </main>
  )
}
