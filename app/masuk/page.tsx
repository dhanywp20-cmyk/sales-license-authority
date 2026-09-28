import { FormMasuk } from './FormMasuk';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Masuk — Kantor Pusat Lisensi' };

export default function HalamanMasuk({ searchParams }: { searchParams: { ke?: string } }) {
  return (
    <div className="halaman-masuk">
      <div className="kartu-masuk">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="" width={56} height={56} />
        <h1>Kantor Pusat Lisensi</h1>
        <p className="muted">Sales Management Platform · khusus developer</p>
        <FormMasuk ke={searchParams.ke ?? '/'} />
      </div>
    </div>
  );
}
