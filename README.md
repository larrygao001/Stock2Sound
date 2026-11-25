# Stock2Sound

**Hear the market.** Stock2Sound turns historical market movements into generative audio. Enter a ticker, load live prices from the market API, choose a musical style, and listen to a sonic interpretation of the market.

## Features

- Pull historical daily prices from Yahoo Finance through a same-origin `/api/market` route (no hand-fed demo series).
- Import your own CSV with a `Close` or `Price` column, plus optional `Date` and `Volume`, if the API is unreachable.
- Visualize recent price movement and summary metrics (return, realized volatility, RSI-14, up days).
- Generate audio in the browser using the Web Audio API.
- Adaptive, Ambient, Electronic, Jazz and Cinematic sound profiles.
- Export a generated WAV audio file.

## How market data becomes music

1. **Price → staff degree:** each close is normalized within its ticker and placed on a scale ladder (staff degrees / lines & spaces).
2. **Staff → named notes:** those degrees become concrete notes (for example `G4`) with MIDI values, shown on the on-screen staff.
3. **Notes → instruments:** each voice is played with sampled instruments (piano, violin, flute, cello, and vibe-specific ensembles), with legato overlap and light room ambience.\n4. **WAV export** still uses a lightweight rendered preview; live playback uses the sampled instruments.

## Run locally

Requires Node.js 18+.

```bash
npm install
npm run dev
```

Open http://127.0.0.1:4537

The app auto-loads `NVDA` from `/api/market` on startup. Change the ticker or time range to fetch again.

## Build

```bash
npm run build
npm start
```

## Data and limitations

Yahoo Finance is a third-party service and may change, throttle requests, or become unavailable. If ticker loading fails, import a CSV instead. This project is for creative/educational use only and is not investment advice. No market data is stored on a server beyond short response caching.

## License

MIT
