import crypto from 'crypto';
import { notFound } from 'next/navigation';
import { LABEL_PAKET, statusEfektif } from '@/lib/kontrak/kontrak.ts';
import { PilihPaketFitur } from '@/app/PilihPaketFitur';
import { PilihJenisDurasi } from '@/app/PilihJenisDurasi';
import { DURASI_STANDAR, labelDurasi } from '@/lib/durasi';
import { LABEL_AKSI, LABEL_JENIS_PERMINTAAN, LABEL_LEWAT, LABEL_STATUS, LABEL_STATUS_PERMINTAAN, label } from '@/lib/label';
import { LicenseService } from '@/lib/license-service';
import { aksiLisensi } from '@/app/actions';

export const dynamic = 'force-dynamic';

function tgl(iso: string | null | undefined) {
  return iso ? new Date(iso).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
}

/** Setiap formulir mendapat aksi_id baru per render → kiriman ganda aman (§49). */
function Tersembunyi({ lic, aksi }: { lic: string; aksi: string }) {
  return (
    <>
      <input type="hidden" name="license_code" value={lic} />
      <input type="hidden" name="aksi" value={aksi} />
      <input type="hidden" name="aksi_id" value={crypto.randomUUID()} />
    </>
  );
}

export default async function DetailLisensi({ params, searchParams }: { params: { code: string }; searchParams: { pesan?: string } }) {
  const info = await LicenseService.get(decodeURIComponent(params.code));
  if (!info) notFound();
  const [audit, permintaan] = await Promise.all([
    LicenseService.auditLog(info.license_code), LicenseService.requestsFor(info.license_code),
  ]);
  const status = statusEfektif(info.status, info.expires_at, new Date(), info.warning_days);
  const lic = info.license_code;
  // Lisensi yang dicabut atau sudah DIGANTI bersifat final — tidak ada tindakan lagi.
  const dicabut = info.status === 'REVOKED' || info.status === 'REPLACED';

  return (
    <>
      <p><a href="/lisensi">← Semua lisensi</a></p>
      {searchParams.pesan && <div className="notice">{searchParams.pesan}</div>}
      <h1>{info.company_name} <span className={`badge ${status}`}>{label(LABEL_STATUS, status)}</span></h1>

      {info.status === 'REPLACED' && (
        <div className="notice">
          Lisensi ini sudah <b>DIGANTI</b> dan tidak bisa dipakai lagi.
          {info.replaced_by_code && <> Lisensi pengganti: <a href={`/l/${info.replaced_by_code}`}>{info.replaced_by_code} →</a></>}
        </div>
      )}
      {info.replaces_code && (
        <p className="muted">Menggantikan lisensi <a href={`/l/${info.replaces_code}`}>{info.replaces_code}</a>.</p>
      )}

      <section className="card">
        <dl className="grid kv">
          <div><dt>Deployment</dt><dd>{info.deployment_code}</dd></div>
          <div><dt>Lisensi</dt><dd>{lic}</dd></div>
          <div><dt>Paket</dt><dd>{LABEL_PAKET[info.package]} {info.license_type === 'TRIAL' && <span className="badge TRIAL">TRIAL</span>}</dd></div>
          <div><dt>Diterbitkan</dt><dd>{tgl(info.issued_at)}</dd></div>
          <div><dt>Mulai</dt><dd>{tgl(info.starts_at)}</dd></div>
          <div><dt>Berakhir</dt><dd>{tgl(info.expires_at)}</dd></div>
          <div><dt>Tenggang</dt><dd>{info.grace_period_days} hari</dd></div>
          <div><dt>Pemeriksaan terakhir</dt><dd>{tgl(info.last_verified_at)}</dd></div>
          <div><dt>Versi aplikasi</dt><dd>{info.application_version ?? '—'}</dd></div>
          <div><dt>Kode Aktivasi</dt><dd>{info.instance_bound ? 'Terikat ke 1 platform' : 'Belum dipakai'}</dd></div>
        </dl>
      </section>

      {!dicabut && (
        <section className="card">
          <h2>Tindakan</h2>
          {DURASI_STANDAR.filter((d) => d.hari <= 365).map((d) => (
            <form key={d.hari} action={aksiLisensi} className="inline">
              <Tersembunyi lic={lic} aksi="extend" />
              <input type="hidden" name="hari" value={d.hari} />
              <button>+{d.label}</button>
            </form>
          ))}
          {info.status === 'SUSPENDED' ? (
            <form action={aksiLisensi} className="inline">
              <Tersembunyi lic={lic} aksi="reactivate" />
              <button className="primary">Aktifkan kembali</button>
            </form>
          ) : (
            <form action={aksiLisensi} className="inline">
              <Tersembunyi lic={lic} aksi="suspend" />
              <input name="alasan" placeholder="Alasan penangguhan" maxLength={500} />
              <button>Tangguhkan</button>
            </form>
          )}
          {info.instance_bound && (
            <form action={aksiLisensi} className="inline">
              <Tersembunyi lic={lic} aksi="unbind" />
              <button title="Izinkan kode dipakai di platform baru (mis. pelanggan pindah server)">Lepas ikatan platform</button>
            </form>
          )}
          <form action={aksiLisensi} className="inline">
            <Tersembunyi lic={lic} aksi="revoke" />
            <input name="konfirmasi" placeholder={`ketik ${lic}`} />
            <input name="alasan" placeholder="Alasan" maxLength={500} />
            <button className="danger">Cabut permanen</button>
          </form>
        </section>
      )}

      {!dicabut && (
        <section className="card">
          <h2>Paket &amp; fitur</h2>
          <form action={aksiLisensi}>
            <Tersembunyi lic={lic} aksi="package" />
            <PilihPaketFitur awalPaket={info.package} awalFitur={info.features} />
            <div className="grid" style={{ marginTop: 12 }}>
              <PilihJenisDurasi labelJenis="Jenis lisensi baru" awalJenis="STANDARD" awalHari={null} bolehTetap />
            </div>
            <p><button className="primary">Terbitkan lisensi baru</button></p>
          </form>
          <p className="muted">
            Setiap perubahan paket/fitur atau trial → penuh menerbitkan <b>lisensi baru</b> (kode baru). Lisensi ini
            menjadi DIGANTI dan tidak bisa dipakai ulang. Platform pelanggan beralih otomatis pada pemeriksaan
            berikutnya. Downgrade hanya menutup akses — data pelanggan tidak pernah dihapus.
          </p>
        </section>
      )}

      <section className="card">
        <h2>Permintaan</h2>
        <table>
          <thead><tr><th>Diajukan</th><th>Jenis</th><th>Paket</th><th>Durasi</th><th>Status</th><th>Alasan</th></tr></thead>
          <tbody>
            {permintaan.map((r) => (
              <tr key={r.id}><td>{tgl(r.requested_at)}</td><td>{label(LABEL_JENIS_PERMINTAAN, r.kind)}</td><td>{LABEL_PAKET[r.requested_package]}</td>
                <td>{labelDurasi(r.duration_days)}</td><td>{label(LABEL_STATUS_PERMINTAAN, r.status)}</td><td>{r.reason ?? ''}</td></tr>
            ))}
            {permintaan.length === 0 && <tr><td colSpan={6} className="muted">Belum ada.</td></tr>}
          </tbody>
        </table>
      </section>

      <section className="card">
        <h2>Audit</h2>
        <table>
          <thead><tr><th>Waktu</th><th>Tindakan</th><th>Oleh</th><th>Lewat</th><th>Alasan</th></tr></thead>
          <tbody>
            {audit.map((a) => (
              <tr key={a.id}><td>{tgl(a.created_at)}</td><td>{label(LABEL_AKSI, a.action)}</td>
                <td>{a.performed_by}</td><td>{label(LABEL_LEWAT, a.performed_via)}</td>
                <td style={{ whiteSpace: 'normal' }}>{a.reason ?? ''}</td></tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}
