import { LABEL_PAKET } from '@/lib/kontrak/kontrak.ts';
import type { PermintaanMenunggu } from '@/lib/license-service';
import { aksiPermintaan } from '@/app/actions';
import { labelDurasi } from '@/lib/durasi';
import { LABEL_JENIS_PERMINTAAN, label } from '@/lib/label';


function tgl(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
}

/** Tabel permintaan yang menunggu keputusan developer (dipakai Ringkasan & Permintaan). */
export function TabelPermintaan({ menunggu }: { menunggu: PermintaanMenunggu[] }) {
  if (menunggu.length === 0) return <p className="kosong">✓ Tidak ada permintaan yang menunggu.</p>;
  return (
    <table>
      <thead><tr><th>Perusahaan</th><th>Jenis</th><th>Paket</th><th>Durasi</th><th>Diajukan</th><th>Catatan</th><th /></tr></thead>
      <tbody>
        {menunggu.map((r) => {
          const d = r.deployments;
          const l = r.licenses;
          return (
            <tr key={r.id}>
              <td><a href={l ? `/l/${l.license_code}` : '#'}><b>{d?.company_name}</b></a><br /><span className="muted">{d?.deployment_code}</span></td>
              <td>{label(LABEL_JENIS_PERMINTAAN, r.kind)}</td>
              <td>{LABEL_PAKET[r.requested_package]}</td>
              <td>{labelDurasi(r.duration_days)}</td>
              <td>{tgl(r.requested_at)}<br /><span className="muted">{r.requested_by ?? ''}</span></td>
              <td style={{ whiteSpace: 'normal', maxWidth: 260 }}>{r.notes ?? ''}</td>
              <td className="aksi">
                <form action={aksiPermintaan} className="inline">
                  <input type="hidden" name="request_id" value={r.id} />
                  <input type="hidden" name="license_code" value={l?.license_code ?? ''} />
                  <button className="primary" name="keputusan" value="approve">Approve</button>
                </form>
                <form action={aksiPermintaan} className="inline">
                  <input type="hidden" name="request_id" value={r.id} />
                  <input type="hidden" name="license_code" value={l?.license_code ?? ''} />
                  <input name="alasan" placeholder="Alasan (opsional)" maxLength={500} />
                  <button name="keputusan" value="reject">Reject</button>
                </form>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
