import type { Metadata } from 'next';
import localFont from 'next/font/local';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import './globals.css';
import '@openmaic/renderer/fonts.css';
import 'animate.css';
import 'katex/dist/katex.min.css';
import { ThemeProvider } from '@/lib/hooks/use-theme';
import { I18nProvider } from '@/lib/hooks/use-i18n';
import { Toaster } from '@/components/ui/sonner';
import { ServerProvidersInit } from '@/components/server-providers-init';
import { StorageHealthNotice } from '@/components/storage-health-notice';
import { AccessCodeGuard } from '@/components/access-code-guard';
import { getStageRoute } from '@/lib/server/model-routes';

const inter = localFont({
  src: '../node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2',
  variable: '--font-sans',
  weight: '100 900',
});

export const metadata: Metadata = {
  title: '玄甲全局智能体',
  description: '玄甲全局智能体的教学内容、互动课堂与实训渲染能力。',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const integrated = process.env.AISECEDU_INTEGRATED === 'true';
  const classroomModel = integrated ? getStageRoute('chat-adapter')?.model || process.env.DEFAULT_MODEL || '' : '';
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <head>
        {integrated && <script dangerouslySetInnerHTML={{ __html: `window.__AISECEDU_CLASSROOM_MODEL__=${JSON.stringify(classroomModel).replace(/</g, '\\u003c')};` }} />}
        {process.env.AISECEDU_INTEGRATED === 'true' && process.env.NEXT_PUBLIC_BASE_PATH ? (
          <script
            // The vendored renderer uses root-relative browser API calls. Add
            // the isolated base path before hydration so those calls stay scoped.
            dangerouslySetInnerHTML={{
              __html: `(function(){var b=${JSON.stringify(process.env.NEXT_PUBLIC_BASE_PATH)};var f=window.fetch.bind(window);window.fetch=function(i,n){if(typeof i==='string'&&i.indexOf('/api/')===0)i=b+i;else if(i instanceof Request){var u=new URL(i.url);if(u.origin===location.origin&&u.pathname.indexOf('/api/')===0){u.pathname=b+u.pathname;i=new Request(u.toString(),i)}}return f(i,n)}})();`,
            }}
          />
        ) : null}
      </head>
      <body
        className={`${GeistSans.variable} ${GeistMono.variable} antialiased`}
        suppressHydrationWarning
      >
        <ThemeProvider>
          <I18nProvider>
            {!integrated && <ServerProvidersInit />}
            {integrated ? children : <AccessCodeGuard>{children}</AccessCodeGuard>}
            <Toaster position="top-center" />
            {/* After the Toaster: this one raises a toast on mount when
                persistence is already broken, and a toast raised before its
                host exists has nowhere to go. */}
            {!integrated && <StorageHealthNotice />}
          </I18nProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
