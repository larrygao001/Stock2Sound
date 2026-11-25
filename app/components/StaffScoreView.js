'use client'

import { midiToStaffY, TREBLE_LINES } from '../lib/staffScore'

export default function StaffScoreView({ score, progress = 0 }) {
  if (!score?.voices?.length) {
    return <div className="empty-chart">Load market data to map prices onto the staff.</div>
  }

  const width = 860
  const height = 210
  const left = 56
  const right = 24
  const top = 28
  const bottom = 36
  const plotW = width - left - right
  const plotH = height - top - bottom
  const { minMidi, maxMidi, noteCount, voices, tonicName, modeLabel } = score
  const playIndex = Math.min(noteCount - 1, Math.floor((progress / 100) * noteCount))

  const lineYs = TREBLE_LINES.map((midi) => top + midiToStaffY(midi, minMidi, maxMidi) * plotH)

  return (
    <div className="staff-card-inner">
      <svg viewBox={`0 0 ${width} ${height}`} className="staff-svg" role="img" aria-label="Price mapped to musical staff">
        <rect x="0" y="0" width={width} height={height} fill="transparent" />
        {lineYs.map((y, index) => (
          <line key={`line-${index}`} x1={left} y1={y} x2={width - right} y2={y} className="staff-line" />
        ))}
        <text x="18" y={lineYs[2] + 5} className="clef-mark">
          𝄞
        </text>
        {voices.map((voice) =>
          voice.notes.map((note, index) => {
            const x = left + (index / Math.max(1, noteCount - 1)) * plotW
            const y = top + midiToStaffY(note.midi, minMidi, maxMidi) * plotH
            const active = index === playIndex
            return (
              <g key={`${voice.symbol}-${index}`}>
                <ellipse
                  cx={x}
                  cy={y}
                  rx={active ? 6.5 : 5}
                  ry={active ? 5 : 3.8}
                  fill={voice.color}
                  opacity={active ? 1 : 0.78}
                  className={active ? 'staff-note active' : 'staff-note'}
                />
                {index % Math.max(4, Math.floor(noteCount / 8)) === 0 && voice === voices[0] && (
                  <text x={x - 8} y={y - 10} className="staff-note-label">
                    {note.name}
                  </text>
                )}
              </g>
            )
          }),
        )}
        <line
          x1={left + (playIndex / Math.max(1, noteCount - 1)) * plotW}
          y1={top - 6}
          x2={left + (playIndex / Math.max(1, noteCount - 1)) * plotW}
          y2={height - bottom + 6}
          className="staff-playhead"
        />
      </svg>
      <div className="staff-meta">
        <span>
          Tonic {tonicName} · {modeLabel}
        </span>
        <span>
          {voices.map((voice) => voice.symbol).join(' + ')} · {noteCount} staff notes
        </span>
        <span>Now: {voices[0]?.notes[playIndex]?.name || '—'}</span>
      </div>
      <div className="staff-legend">
        {voices.map((voice) => (
          <span key={voice.symbol} className="legend-item">
            <i style={{ background: voice.color }} />
            {voice.symbol}
            <em>
              {voice.instrumentLabel || 'Instrument'} · {voice.notes[0]?.name}→{voice.notes.at(-1)?.name}
            </em>
          </span>
        ))}
      </div>
    </div>
  )
}
