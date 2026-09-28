import { FormMasuk } from './FormMasuk';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Masuk — Kantor Pusat Lisensi' };

export default function HalamanMasuk({ searchParams }: { searchParams: { ke?: string } }) {
  return (
    <main className="masuk-dua">
      {/* KIRI: panel identitas (desktop) — sama dengan halaman masuk aplikasi Sales. */}
      <aside className="masuk-kiri">
        <div className="latar" aria-hidden="true" />
        <div className="merek">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="" width={40} height={40} />
          <span>Sales Management Platform <em>· Kantor Pusat</em></span>
        </div>
        <div className="isi-kiri">
          <h1>Kendali lisensi semua platform pelanggan.</h1>
          <p>
            Terbitkan Kode Aktivasi, setujui permintaan lewat Telegram, dan pantau masa berlaku setiap
            deployment — tanpa pernah menyentuh data bisnis pelanggan.
          </p>
          <ul>
            <li>🔑 Kode Aktivasi</li>
            <li>✅ Persetujuan Telegram</li>
            <li>🧪 Lisensi Trial</li>
            <li>📊 Ringkasan &amp; Audit</li>
          </ul>
        </div>
        <p className="kaki">© {new Date().getFullYear()} Sales Management Platform · khusus developer</p>
      </aside>

      {/* KANAN: formulir */}
      <section className="masuk-kanan">
        <div className="kartu-masuk">
          <div className="merek-ponsel">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="" width={36} height={36} />
            <b>Kantor Pusat Lisensi</b>
          </div>
          <h2>Selamat Datang</h2>
          <p className="muted">Masuk ke dashboard Kantor Pusat untuk melanjutkan</p>
          <FormMasuk ke={searchParams.ke ?? '/'} />
        </div>
      </section>
    </main>
  );
}
