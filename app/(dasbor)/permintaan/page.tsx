import { LicenseService } from '@/lib/license-service';
import { TabelPermintaan } from '../TabelPermintaan';

export const dynamic = 'force-dynamic';

export default async function HalamanPermintaan() {
  const menunggu = await LicenseService.pendingRequests();
  return (
    <>
      <div className="kepala-halaman">
        <div>
          <h1>Permintaan</h1>
          <p className="muted">
            Perpanjangan, ganti paket, dan lisensi baru dari platform yang sudah terhubung. Keputusan di sini sama
            dengan tombol APPROVE/REJECT di Telegram.
          </p>
        </div>
      </div>
      <section className="card">
        <h2>Menunggu persetujuan ({menunggu.length})</h2>
        <TabelPermintaan menunggu={menunggu} />
      </section>
      <p className="muted">
        Pengajuan dari platform yang <b>belum</b> punya Kode Aktivasi hanya dikirim ke Telegram (📝 PENGAJUAN LISENSI
        BARU) — tanggapi dengan <a href="/register">Registrasi deployment</a>.
      </p>
    </>
  );
}
