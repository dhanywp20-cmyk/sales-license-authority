import './globals.css';

export const metadata = {
  title: 'Kantor Pusat Lisensi — Sales Management Platform',
  robots: { index: false, follow: false },
};

export const viewport = { width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
