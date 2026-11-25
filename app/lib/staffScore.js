import { analyze, midiToHz, sampleSeries } from './marketMath'

export const LAYER_COLORS = ['#c7f36b', '#7ec8ff', '#f0a36b', '#d7a6ff']
export const LAYER_WAVES = ['triangle', 'sine', 'sawtooth', 'square']
export const LAYER_OFFSETS = [0, 7, 12, 19]

const PITCH_CLASS_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

/** Treble-staff line midis from bottom to top: E4 G4 B4 D5 F5 */
export const TREBLE_LINES = [64, 67, 71, 74, 77]

export function midiToNoteName(midi) {
  const rounded = Math.round(midi)
  return `${PITCH_CLASS_NAMES[((rounded % 12) + 12) % 12]}${Math.floor(rounded / 12) - 1}`
}

export function midiToStaffY(midi, minMidi, maxMidi) {
  const lo = Math.min(minMidi, 55)
  const hi = Math.max(maxMidi, 84)
  const t = (midi - lo) / Math.max(1, hi - lo)
  return 1 - Math.max(0, Math.min(1, t))
}

/**
 * Price line → staff degrees (scale steps on a grand pitch ladder) → named notes + MIDI.
 * Playback and WAV export should consume this score, not raw prices.
 */
export function composeStaffScore(sources, preset, { noteCount = 48, maxSources = 4 } = {}) {
  if (!sources?.length || !preset) return null

  const limited = sources.slice(0, maxSources)
  const metricsList = limited.map((source) => analyze(source.rows))
  const avgVolatility = metricsList.reduce((sum, item) => sum + item.volatility, 0) / metricsList.length
  const volatilityFactor = Math.min(1.8, Math.max(0.65, avgVolatility / 1.8))
  const secondsPerNote = preset.beat / volatilityFactor

  // Uptrend → brighter tonic (C4); downtrend → darker tonic (A3).
  const rising = metricsList[0].change >= 0
  const tonicMidi = rising ? 60 : 57
  const scale = preset.scale
  const staffSpan = scale.length * 3
  const instruments = preset.instruments || ['acoustic_grand_piano', 'violin', 'flute', 'cello']
  const instrumentLabels = preset.instrumentLabels || instruments.map((id) => id.replaceAll('_', ' '))

  const voices = limited.map((source, voiceIndex) => {
    const sampled = sampleSeries(source.rows, noteCount)
    const closes = sampled.map((row) => row.close)
    const min = Math.min(...closes)
    const max = Math.max(...closes)
    const range = Math.max(0.0001, max - min)
    const volumeMax = Math.max(1, ...sampled.map((row) => row.volume || 0))
    const instrument = instruments[voiceIndex % instruments.length]
    const instrumentLabel = instrumentLabels[voiceIndex % instrumentLabels.length]

    const notes = sampled.map((row) => {
      const norm = (row.close - min) / range
      // Staff degree: low prices sit on lower lines/spaces; highs climb the staff.
      const staffDegree = Math.round(norm * (staffSpan - 1))
      const octave = Math.floor(staffDegree / scale.length)
      const scaleIndex = staffDegree % scale.length
      const midi = tonicMidi + LAYER_OFFSETS[voiceIndex % LAYER_OFFSETS.length] + octave * 12 + scale[scaleIndex]
      return {
        date: row.date,
        close: row.close,
        volume: row.volume || 0,
        norm,
        staffDegree,
        scaleIndex,
        midi,
        name: midiToNoteName(midi),
        velocity: 0.35 + ((row.volume || 0) / volumeMax) * 0.55,
      }
    })

    return {
      symbol: source.symbol,
      color: LAYER_COLORS[voiceIndex % LAYER_COLORS.length],
      wave: voiceIndex === 0 ? preset.wave : LAYER_WAVES[voiceIndex % LAYER_WAVES.length],
      instrument,
      instrumentLabel,
      notes,
      metrics: metricsList[voiceIndex],
    }
  })

  const allMidi = voices.flatMap((voice) => voice.notes.map((note) => note.midi))

  return {
    voices,
    secondsPerNote,
    // Overlap notes so phrases feel legato instead of chopped beeps.
    noteDuration: secondsPerNote * (preset.legato ?? 1.75),
    tonicMidi,
    tonicName: midiToNoteName(tonicMidi),
    modeLabel: rising ? 'bright tonic (uptrend)' : 'dark tonic (downtrend)',
    scale,
    minMidi: Math.min(...allMidi),
    maxMidi: Math.max(...allMidi),
    noteCount,
    harmony: Boolean(preset.harmony),
    softDrums: Boolean(preset.softDrums),
    bassInstrument: preset.bassInstrument || 'acoustic_bass',
    bassWave: preset.bass,
    volatilityFactor,
  }
}

export { midiToHz }
