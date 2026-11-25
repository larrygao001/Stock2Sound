import './globals.css'

export const metadata = {
  title: 'Stock2Sound — Hear the market',
  description: 'Turn market movements into generative music. Every ticker has a sound.',
}

export const viewport = {
  themeColor: '#0b0d12',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
