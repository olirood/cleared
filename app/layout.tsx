import type { Metadata, Viewport } from 'next';
import { cookies } from 'next/headers';
import './globals.css';

export const metadata: Metadata = {
  title: 'Cleared',
  description: 'Splits, label copy y firmas.',
  robots: { index: false, follow: false },
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover' };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // tema elegido en Cuenta; sin cookie sigue al sistema
  const t = (await cookies()).get('cleared-theme')?.value;
  const theme = t === 'light' || t === 'dark' ? t : undefined;
  return (
    <html lang="es" data-theme={theme}>
      <body>
        <div className="ambient" aria-hidden="true"><i /></div>
        {children}
      </body>
    </html>
  );
}
