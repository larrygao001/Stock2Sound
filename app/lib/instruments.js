'use client'

import Soundfont from 'soundfont-player'

const cache = new Map()

export const INSTRUMENT_LABELS = {
  acoustic_grand_piano: 'Piano',
  electric_piano_1: 'E-Piano',
  violin: 'Violin',
  viola: 'Viola',
  cello: 'Cello',
  flute: 'Flute',
  clarinet: 'Clarinet',
  oboe: 'Oboe',
  french_horn: 'Horn',
  trumpet: 'Trumpet',
  harp: 'Harp',
  string_ensemble_1: 'Strings',
  pad_2_warm: 'Warm Pad',
  lead_2_sawtooth: 'Synth Lead',
  acoustic_bass: 'Bass',
  choir_aahs: 'Choir',
}

export function labelForInstrument(id) {
  return INSTRUMENT_LABELS[id] || id.replaceAll('_', ' ')
}

export async function loadInstrument(audioContext, instrumentId, destination) {
  const key = `${instrumentId}::${destination ? 'bus' : 'out'}`
  if (cache.has(key)) {
    const cached = cache.get(key)
    if (cached.ctx === audioContext) return cached.player
  }

  const player = await Soundfont.instrument(audioContext, instrumentId, {
    soundfont: 'MusyngKite',
    format: 'mp3',
    destination: destination || audioContext.destination,
  })

  cache.set(key, { ctx: audioContext, player, instrumentId })
  return player
}

export async function loadInstrumentSet(audioContext, instrumentIds, destination) {
  const unique = [...new Set(instrumentIds.filter(Boolean))]
  const entries = await Promise.all(
    unique.map(async (id) => [id, await loadInstrument(audioContext, id, destination)]),
  )
  return Object.fromEntries(entries)
}

/** Soft room ambience so notes blend instead of sounding like isolated beeps. */
export function createAmbienceBus(audioContext, destination) {
  const input = audioContext.createGain()
  const dry = audioContext.createGain()
  const wet = audioContext.createGain()
  const delay = audioContext.createDelay(1.2)
  const feedback = audioContext.createGain()
  const filter = audioContext.createBiquadFilter()

  dry.gain.value = 1
  wet.gain.value = 0.55
  delay.delayTime.value = 0.22
  feedback.gain.value = 0.32
  filter.type = 'lowpass'
  filter.frequency.value = 4200

  input.connect(dry)
  dry.connect(destination)

  input.connect(filter)
  filter.connect(delay)
  delay.connect(wet)
  wet.connect(destination)
  delay.connect(feedback)
  feedback.connect(filter)

  return input
}

export function stopPlayers(players) {
  Object.values(players || {}).forEach((player) => {
    try {
      player?.stop?.()
    } catch {}
  })
}
