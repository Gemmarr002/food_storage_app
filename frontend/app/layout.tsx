import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import { Noto_Sans_SC } from 'next/font/google'
import './globals.css'

const notoSans = Noto_Sans_SC({ subsets: ['latin'], variable: '--font-noto-sans' })

export const metadata: Metadata = {
  title: '食光 - 家庭食材助手',
  description: '管理家庭食材、发现匹配菜谱、安排饮食计划并整理采购清单的本地优先厨房助手。',
  manifest: '/manifest.webmanifest',
  applicationName: '食光',
  appleWebApp: {
    capable: true,
    title: '食光',
    statusBarStyle: 'default',
  },
  icons: {
    icon: [{ url: '/food-icon.svg', type: 'image/svg+xml' }, { url: '/icon-192.png', sizes: '192x192', type: 'image/png' }],
    apple: [{ url: '/apple-icon.png' }],
  },
}

export const viewport: Viewport = {
  colorScheme: 'light',
  themeColor: '#f8faf7',
  width: 'device-width',
  initialScale: 1,
  userScalable: false,
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN" className="bg-background">
      <body className={`${notoSans.variable} font-sans antialiased`}>
        {children}
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
