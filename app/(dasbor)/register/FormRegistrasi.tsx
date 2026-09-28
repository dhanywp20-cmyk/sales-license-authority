'use client';

import { useFormState, useFormStatus } from 'react-dom';
import type { Paket } from '@/lib/kontrak/kontrak.ts';
import { PilihPaketFitur } from '@/app/PilihPaketFitur';
import { PilihJenisDurasi } from '@/app/PilihJenisDurasi';
import { aksiRegistrasi, type HasilRegistrasi } from '@/app/actions';

function Kirim() {
  const { pending } = useFormStatus();
  return <button className="primary" disabled={pending}>{pending ? 'Memproses…' : 'Registrasi'}</button>;
}

export function FormRegistrasi({ awal }: {
  awal?: { company: string; paket?: Paket; jenis: 'STANDARD' | 'TRIAL'; hari: number };
}) {
  const [hasil, aksi] = useFormState<HasilRegistrasi, FormData>(aksiRegistrasi, {});

  if (hasil.deployment_key) {
    return (
      <div className="card">
        <h2>✓ Deployment terdaftar</h2>
        <div className="notice">
          Berikan <b>Kode Aktivasi</b> di bawah ke Admin pelanggan. Kode tersimpan terenkripsi dan bisa dilihat lagi di
          halaman lisensinya (atau <a href="/ekspor-kode">Ekspor kode</a>); salinannya juga dikirim ke Telegram Anda.
          Kode terikat ke platform pertama yang memakainya.
        </div>
        <h2>Kode Aktivasi</h2>
        <p className="muted">Admin pelanggan menempelnya di aplikasi Sales → Admin Panel → Lisensi → Aktifkan.</p>
        <pre className="secret" style={{ fontSize: 15 }}>{hasil.kode_aktivasi}</pre>
        <details>
          <summary className="muted">Alternatif untuk developer: isi Environment Variables Vercel pelanggan</summary>
          <pre className="secret">{[
          `LICENSE_AUTHORITY_URL=${typeof window !== 'undefined' ? window.location.origin : ''}`,
          `LICENSE_DEPLOYMENT_ID=${hasil.deployment_code}`,
          `LICENSE_ID=${hasil.license_code}`,
          `LICENSE_DEPLOYMENT_KEY=${hasil.deployment_key}`,
        ].join('\n')}</pre>
        </details>
        <p><a href={`/l/${hasil.license_code}`}>Buka lisensi {hasil.license_code} →</a></p>
      </div>
    );
  }

  return (
    <form action={aksi} className="card" data-tanpa-progres>
      {hasil.galat && <div className="notice">{hasil.galat}</div>}
      <div className="grid">
        <label>Nama perusahaan<br /><input name="company" required minLength={2} maxLength={160} placeholder="PT ABC" defaultValue={awal?.company} /></label>
        <label>Lingkungan<br />
          <select name="environment" defaultValue="production">
            <option value="production">production</option>
            <option value="staging">staging</option>
            <option value="development">development</option>
          </select>
        </label>
        <PilihJenisDurasi awalJenis={awal?.jenis ?? 'STANDARD'} awalHari={awal?.hari} />
      </div>
      <PilihPaketFitur awalPaket={awal?.paket} />
      <p className="muted">Lisensi langsung <b>aktif</b> sejak kode ditempel pelanggan — menerbitkan kode berarti Anda sudah menyetujuinya.</p>
      <Kirim />
    </form>
  );
}
