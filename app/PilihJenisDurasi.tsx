'use client';

import { useState } from 'react';
import { DURASI_STANDAR, DURASI_TRIAL } from '@/lib/durasi';

/**
 * Jenis lisensi + durasi dalam pilihan yang SAMA dengan formulir permintaan
 * di aplikasi Sales (1/3/6 bulan, 1/2 tahun), supaya apa yang diminta
 * pelanggan bisa dipilih apa adanya. Trial punya preset hari sendiri; jumlah
 * hari bebas hanya lewat "Lainnya".
 * Mengirim field `jenis` dan `hari` (kosong = pertahankan sisa masa berlaku).
 */
const LAINNYA = 'lainnya';

type Jenis = 'STANDARD' | 'TRIAL';

function bawaan(jenis: Jenis) { return jenis === 'TRIAL' ? 14 : 365; }

export function PilihJenisDurasi({ awalJenis = 'STANDARD', awalHari, bolehTetap = false, labelJenis = 'Jenis lisensi' }: {
  awalJenis?: Jenis; awalHari?: number | null; bolehTetap?: boolean; labelJenis?: string;
}) {
  const [jenis, setJenis] = useState<Jenis>(awalJenis);
  const daftar = jenis === 'TRIAL' ? DURASI_TRIAL : DURASI_STANDAR;
  const awal = bolehTetap && awalHari == null ? '' : String(awalHari ?? bawaan(awalJenis));
  const [pilihan, setPilihan] = useState<string>(
    awal === '' || daftar.some((d) => String(d.hari) === awal) ? awal : LAINNYA);
  const [hariLain, setHariLain] = useState<string>(pilihan === LAINNYA ? awal : '');

  function gantiJenis(j: Jenis) {
    setJenis(j);
    if (pilihan !== '') setPilihan(String(bawaan(j)));
  }

  return (
    <>
      <label>{labelJenis}<br />
        <select name="jenis" value={jenis} onChange={(e) => gantiJenis(e.target.value as Jenis)}>
          <option value="STANDARD">Berlangganan (berbayar)</option>
          <option value="TRIAL">Trial</option>
        </select>
      </label>
      <label>Durasi<br />
        <select value={pilihan} onChange={(e) => setPilihan(e.target.value)}>
          {bolehTetap && <option value="">Tetap — pakai sisa masa berlaku</option>}
          {daftar.map((d) => <option key={d.hari} value={d.hari}>{d.label}</option>)}
          {jenis === 'TRIAL' && <option value={LAINNYA}>Lainnya (isi jumlah hari)…</option>}
        </select>
      </label>
      {pilihan === LAINNYA && (
        <label>Jumlah hari trial<br />
          <input type="number" min={1} max={365} required value={hariLain} onChange={(e) => setHariLain(e.target.value)} placeholder="mis. 21" />
        </label>
      )}
      <input type="hidden" name="hari" value={pilihan === LAINNYA ? hariLain : pilihan} />
    </>
  );
}
