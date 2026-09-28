import { LicenseService } from '@/lib/license-service';
import { aksiKeluar } from '@/app/masuk/aksi';
import { Sidebar } from './Sidebar';

export const dynamic = 'force-dynamic';

export default async function LayoutDasbor({ children }: { children: React.ReactNode }) {
  // Lencana jumlah permintaan. Database bermasalah tidak boleh membuat seluruh
  // dashboard (termasuk halaman Pemeriksaan) ikut gagal dibuka.
  let menunggu = 0;
  try { menunggu = (await LicenseService.pendingRequests()).length; } catch { /* lihat /cek */ }

  const keluar = (
    <form action={aksiKeluar}>
      <button className="tombol-keluar">⎋ Keluar</button>
    </form>
  );

  return (
    <div className="kerangka">
      <header className="atas">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="" width={32} height={32} />
        <div>
          <b>Kantor Pusat Lisensi</b>
          <span>Sales Management Platform</span>
        </div>
        <div className="atas-kanan">{keluar}</div>
      </header>
      <div className="badan">
        <Sidebar menunggu={menunggu} keluar={keluar} />
        <main>{children}</main>
      </div>
    </div>
  );
}
