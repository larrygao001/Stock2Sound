# Stock2Sound

**Hear the market.** Stock2Sound turns historical market movements into generative audio. Enter a ticker, load historical prices, choose a musical style, and listen to a sonic interpretation of the market.

## Features

- Load historical daily prices for a ticker through Yahoo Finance's chart endpoint (with a public CORS fallback).
- Import your own CSV with a `Close` or `Price` column, plus optional `Date` and `Volume`.
- Visualize recent price movement and summary metrics (return, realized volatility, RSI-14, up days).
- Generate audio in the browser using the Web Audio API.
- Adaptive, Ambient, Electronic, Jazz and Cinematic sound profiles.
- Export a generated WAV audio file.

## How market data becomes music

- **Price movement → melody:** relative price levels map to scale degrees and octaves.
- **Volatility → tempo:** more volatile periods move through notes faster.
- **Volume → dynamics:** higher trading volume increases note intensity.
- **Trend → tonal center:** positive and negative periods shift the composition's tonal base.

RSI is displayed as a market-context metric; it is not yet used as a separate synthesis control in this MVP.

## Run locally

Requires Node.js 18+.

```bash
npm install
npm run dev
```

Open the local URL printed by Vite.

## Build

```bash
npm run build
npm run preview
```

## Deploy to GitHub Pages

1. In the repository, open **Settings → Pages**.
2. Choose **GitHub Actions** as the build and deployment source.
3. Add the workflow below (already included in `.github/workflows/deploy.yml`).
4. After the first successful workflow, the site will be available at `https://susanmu2020.github.io/Stock2Sound/`.

## Data and limitations

Yahoo Finance endpoints and public CORS proxies are third-party services and may change, throttle requests, or become unavailable. If ticker loading fails, import a CSV instead. The included initial chart is illustrative demo data, not a live quote. This project is for creative/educational use only and is not investment advice. No market data is stored on a server.

## License

MIT