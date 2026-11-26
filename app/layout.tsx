import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import { CartProvider } from '@/components/market/cart-store'
import { CatalogProvider } from '@/components/market/catalog-store'
import './globals.css'

export const metadata: Metadata = {
  title: 'Market Mutual | Comprá online',
  description: 'Prototipo local del catálogo y checkout de Market Mutual.',
  generator: 'v0.app',
  icons: {
    icon: [
      {
        url: '/icon-light-32x32.png',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/icon-dark-32x32.png',
        media: '(prefers-color-scheme: dark)',
      },
      {
        url: '/icon.svg',
        type: 'image/svg+xml',
      },
    ],
    apple: '/apple-icon.png',
  },
}

export const viewport: Viewport = {
  colorScheme: 'light dark',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: 'white' },
    { media: '(prefers-color-scheme: dark)', color: 'black' },
  ],
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="es">
      <body className="antialiased">
        <CatalogProvider>
          <CartProvider>{children}</CartProvider>
        </CatalogProvider>
        {process.env.NODE_ENV === 'production' && process.env.VERCEL === '1' && <Analytics />}
      </body>
    </html>
  )
}
