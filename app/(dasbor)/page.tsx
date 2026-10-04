import { LABEL_PAKET } from '@/lib/kontrak/kontrak.ts';
import { LicenseService } from '@/lib/license-service';
import { rahasiaTotp } from '@/lib/totp';
import { TabelPermintaan } from './TabelPermintaan';
import { LABEL_AKSI, LABEL_LEWAT, label } from '@/lib/label';

export const dynamic = 'force-dynamic';

function tgl(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
}
function waktu(iso: string) {
  return new Date(iso).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}
function perangkat(ua: string): string {
  const os = /Android/i.test(ua) ? 'Android' : /iPhone|iPad/i.test(ua) ? 'iOS' : /Windows/i.test(ua) ? 'Windows'
    : /Mac OS X/i.test(ua) ? 'macOS' : /Linux/i.test(ua) ? 'Linux' : 'Perangkat lain';
  const b = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  return `${b} · ${os}`;
}
function sisaHari(iso: string | null): number | null {
  return iso ? Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000) : null;
}


export default async function Ringkasan() {
  const [semua, menunggu, aktivitas, login] = await Promise.all([
    LicenseService.list(), LicenseService.pendingRequests(), LicenseService.auditTerbaru(),
    LicenseService.loginTerakhir().catch(() => []),
  ]);
  const berlaku = semua.filter((l) => l.status_efektif !== 'REPLACED');
  const hitung = (s: string) => berlaku.filter((l) => l.status_efektif === s).length;
  const trial = berlaku.filter((l) => l.license_type === 'TRIAL' && ['ACTIVE', 'EXPIRING_SOON'].includes(l.status_efektif)).length;
  const segera = berlaku
    .filter((l) => ['ACTIVE', 'EXPIRING_SOON'].includes(l.status_efektif) && (sisaHari(l.expires_at) ?? 999) <= 30)
    .sort((a, b) => (sisaHari(a.expires_at) ?? 0) - (sisaHari(b.expires_at) ?? 0));
  // Lisensi aktif yang tidak diperiksa platformnya > 2 hari: platform mati atau tidak terhubung.
  const senyap = berlaku.filter((l) => l.status_efektif === 'ACTIVE'
    && (!l.last_verified_at || Date.now() - new Date(l.last_verified_at).getTime() > 2 * 86_400_000));

  const kartu = [
    { label: 'Lisensi aktif', nilai: hitung('ACTIVE') + hitung('EXPIRING_SOON'), href: '/lisensi?status=ACTIVE', warna: 'hijau' },
    { label: 'Trial berjalan', nilai: trial, href: '/lisensi', warna: 'biru' },
    { label: 'Segera berakhir (≤ 30 hari)', nilai: segera.length, href: '/lisensi?status=EXPIRING_SOON', warna: 'kuning' },
    { label: 'Menunggu persetujuan', nilai: menunggu.length, href: '/permintaan', warna: menunggu.length ? 'merah' : 'abu' },
    { label: 'Berakhir / ditangguhkan', nilai: hitung('EXPIRED') + hitung('SUSPENDED'), href: '/lisensi?status=EXPIRED', warna: 'abu' },
    { label: 'Total deployment', nilai: new Set(semua.map((l) => l.deployment_code)).size, href: '/lisensi', warna: 'abu' },
  ];

  return (
    <>
      <div className="kepala-halaman">
        <div>
          <h1>Ringkasan</h1>
          <p className="muted">Kendali lisensi semua platform pelanggan — tanpa data bisnis pelanggan.</p>
        </div>
        <a className="tombol primary" href="/register">➕ Registrasi deployment</a>
      </div>

      <div className="statistik">
        {kartu.map((k) => (
          <a key={k.label} href={k.href} className={`stat ${k.warna}`}>
            <span className="angka">{k.nilai}</span>
            <span className="label">{k.label}</span>
          </a>
        ))}
      </div>

      <section className="card">
        <div className="kepala-kartu">
          <h2>Perlu tindakan — permintaan menunggu</h2>
          <a href="/permintaan">Semua →</a>
        </div>
        <TabelPermintaan menunggu={menunggu.slice(0, 5)} />
      </section>

      <div className="dua-kolom">
        <section className="card">
          <div className="kepala-kartu">
            <h2>Segera berakhir</h2>
            <a href="/lisensi?status=EXPIRING_SOON">Semua →</a>
          </div>
          {segera.length === 0 ? <p className="kosong">✓ Tidak ada yang berakhir dalam 30 hari.</p> : (
            <table>
              <thead><tr><th>Perusahaan</th><th>Paket</th><th>Berakhir</th><th>Sisa</th></tr></thead>
              <tbody>
                {segera.slice(0, 8).map((l) => (
                  <tr key={l.license_code}>
                    <td><a href={`/l/${l.license_code}`}><b>{l.company_name}</b></a>
                      {l.license_type === 'TRIAL' && <> <span className="badge TRIAL">TRIAL</span></>}</td>
                    <td>{LABEL_PAKET[l.package]}</td>
                    <td>{tgl(l.expires_at)}</td>
                    <td><b>{sisaHari(l.expires_at)}</b> hari</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {senyap.length > 0 && (
            <p className="catatan">
              ⚠ {senyap.length} lisensi aktif tidak diperiksa platformnya lebih dari 2 hari:{' '}
              {senyap.slice(0, 5).map((l, i) => (
                <span key={l.license_code}>{i > 0 && ', '}<a href={`/l/${l.license_code}`}>{l.company_name}</a></span>
              ))}
            </p>
          )}
        </section>

        <section className="card">
          <h2>Login Developer terakhir</h2>
          {!rahasiaTotp() && (
            <p className="notice">2FA belum aktif. Jalankan <code>npm run totp</code>, isi <code>CENTRAL_ADMIN_TOTP_SECRET</code> di Vercel, lalu Redeploy.</p>
          )}
          {login.length === 0 ? <p className="kosong">Belum ada catatan login.</p> : (
            <ul className="linimasa">
              {login.map((l) => (
                <li key={l.waktu}>
                  <span className="waktu">{waktu(l.waktu)}</span>
                  <span><b>{l.ip}</b> <span className="muted">— {perangkat(l.ua)}</span></span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card">
          <h2>Aktivitas terbaru</h2>
          {aktivitas.length === 0 ? <p className="kosong">Belum ada aktivitas.</p> : (
            <ul className="linimasa">
              {aktivitas.map((a) => (
                <li key={a.id}>
                  <span className="waktu">{waktu(a.created_at)}</span>
                  <span>
                    <b>{label(LABEL_AKSI, a.action)}</b>
                    {a.deployments?.company_name && <> · {a.licenses
                      ? <a href={`/l/${a.licenses.license_code}`}>{a.deployments.company_name}</a>
                      : a.deployments.company_name}</>}
                    <span className="muted"> — {label(LABEL_LEWAT, a.performed_via)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
