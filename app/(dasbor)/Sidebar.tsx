'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

const KELOMPOK: { judul: string; menu: { href: string; label: string; ikon: string }[] }[] = [
  {
    judul: 'Utama',
    menu: [
      { href: '/', label: 'Ringkasan', ikon: '📊' },
      { href: '/lisensi', label: 'Lisensi', ikon: '🔑' },
      { href: '/permintaan', label: 'Permintaan', ikon: '📥' },
    ],
  },
  {
    judul: 'Pelanggan',
    menu: [
      { href: '/register', label: 'Registrasi', ikon: '➕' },
    ],
  },
  {
    judul: 'Sistem',
    menu: [
      { href: '/cek', label: 'Pemeriksaan', ikon: '🩺' },
    ],
  },
];

function aktif(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  // Detail lisensi (/l/KODE) termasuk menu Lisensi.
  if (href === '/lisensi') return pathname.startsWith('/lisensi') || pathname.startsWith('/l/');
  return pathname.startsWith(href);
}

export function Sidebar({ menunggu, keluar }: { menunggu: number; keluar: React.ReactNode }) {
  const pathname = usePathname();
  // Menu yang diklik langsung tersorot, sebelum halamannya selesai dimuat.
  const [tujuan, setTujuan] = useState<string | null>(null);
  useEffect(() => { setTujuan(null); }, [pathname]);
  const sorot = (href: string) => (tujuan ? tujuan === href : aktif(pathname, href));
  return (
    <aside className="sisi">
      <nav>
        {KELOMPOK.map((k) => (
          <div key={k.judul} className="kelompok" role="group" aria-label={k.judul}>
            <p className="judul-kelompok">{k.judul}</p>
            {k.menu.map((m) => (
              <Link key={m.href} href={m.href} className={`menu${sorot(m.href) ? ' aktif' : ''}`}
                aria-current={aktif(pathname, m.href) ? 'page' : undefined}
                onClick={() => { if (!aktif(pathname, m.href)) setTujuan(m.href); }}>
                <span aria-hidden="true">{m.ikon}</span>
                {m.label}
                {m.href === '/permintaan' && menunggu > 0 && <span className="hitung">{menunggu}</span>}
              </Link>
            ))}
          </div>
        ))}
      </nav>
      <div className="pengguna">
        <div className="avatar" aria-hidden="true">D</div>
        <div className="nama">
          <b>Developer</b>
          <span>Kantor Pusat</span>
        </div>
        {keluar}
      </div>
    </aside>
  );
}
