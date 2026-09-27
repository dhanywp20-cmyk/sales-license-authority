'use client';

import { useFormState, useFormStatus } from 'react-dom';
import type { Paket } from '@/lib/kontrak/kontrak.ts';
import { PilihPaketFitur } from '../PilihPaketFitur';
import { aksiRegistrasi, type HasilRegistrasi } from '../actions';

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
          Salin <b>Kode Aktivasi</b> di bawah <b>sekarang</b> dan berikan ke Admin pelanggan. Kode ini tidak akan
          ditampilkan lagi — pusat hanya menyimpan hash kuncinya. Kode terikat ke platform pertama yang memakainya.
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
    <form action={aksi} className="card">
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
        <label>Jenis lisensi<br />
          <select name="jenis" defaultValue={awal?.jenis ?? 'STANDARD'}>
            <option value="STANDARD">Standar (berbayar)</option>
            <option value="TRIAL">Trial</option>
          </select>
        </label>
        <label>Durasi (hari — bebas, mis. trial 7 / 14 / 30)<br /><input name="hari" type="number" min={1} max={3660} defaultValue={awal?.hari ?? 365} required /></label>
      </div>
      <PilihPaketFitur awalPaket={awal?.paket} />
      <p><label><input type="checkbox" name="aktifkan" /> Langsung aktifkan (tanpa menunggu permintaan dari Admin pelanggan)</label></p>
      <Kirim />
    </form>
  );
}
