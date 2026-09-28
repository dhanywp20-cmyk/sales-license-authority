'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

/**
 * Bilah progres di atas layar saat pindah halaman (seperti NProgress):
 * mulai saat tautan diklik / formulir dikirim, maju perlahan sampai ±85%,
 * lalu penuh dan memudar ketika URL sudah berganti.
 * Formulir bertanda data-tanpa-progres punya indikator sendiri.
 */
export function ProgresNavigasi() {
  const pathname = usePathname();
  const cari = useSearchParams();
  const [lebar, setLebar] = useState(0);
  const [tampil, setTampil] = useState(false);
  const aktif = useRef(false);
  const pewaktu = useRef<ReturnType<typeof setInterval> | null>(null);

  function mulai() {
    if (aktif.current) return;
    aktif.current = true;
    setTampil(true);
    setLebar(8);
    pewaktu.current = setInterval(() => setLebar((l) => (l < 85 ? l + (85 - l) * 0.12 : l)), 200);
  }

  function selesai() {
    if (!aktif.current) return;
    aktif.current = false;
    if (pewaktu.current) clearInterval(pewaktu.current);
    setLebar(100);
    setTimeout(() => { setTampil(false); setLebar(0); }, 350);
  }

  // URL berganti = halaman baru sudah tampil.
  useEffect(() => { selesai(); }, [pathname, cari]);

  useEffect(() => {
    const klik = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement | null)?.closest('a');
      if (!a || a.target === '_blank' || a.hasAttribute('download')) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      if (url.pathname.startsWith('/ekspor')) return; // unduhan berkas, bukan pindah halaman
      mulai();
    };
    const kirim = (e: SubmitEvent) => {
      const f = e.target as HTMLFormElement | null;
      if (f && !f.hasAttribute('data-tanpa-progres')) mulai();
    };
    document.addEventListener('click', klik, true);
    document.addEventListener('submit', kirim, true);
    return () => {
      document.removeEventListener('click', klik, true);
      document.removeEventListener('submit', kirim, true);
    };
  }, []);

  // Pengaman: bila tidak ada pergantian URL (mis. galat), berhenti setelah 12 detik.
  useEffect(() => {
    if (!tampil) return;
    const t = setTimeout(selesai, 12_000);
    return () => clearTimeout(t);
  }, [tampil]);

  return (
    <div className={`progres-atas${tampil ? ' tampil' : ''}`} role="progressbar" aria-hidden={!tampil}
      aria-label="Memuat halaman">
      <div className="progres-isi" style={{ width: `${lebar}%` }} />
    </div>
  );
}
