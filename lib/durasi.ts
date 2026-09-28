/** Pilihan durasi — SAMA dengan formulir permintaan di aplikasi Sales (TabLisensi.tsx → DURASI). */
export const DURASI_STANDAR = [
  { hari: 30, label: '1 Bulan' },
  { hari: 90, label: '3 Bulan' },
  { hari: 180, label: '6 Bulan' },
  { hari: 365, label: '1 Tahun' },
  { hari: 730, label: '2 Tahun' },
];

/** Preset trial; jumlah hari lain tetap bisa diisi lewat "Lainnya". */
export const DURASI_TRIAL = [
  { hari: 7, label: '7 hari' },
  { hari: 14, label: '14 hari' },
  { hari: 30, label: '30 hari' },
];

export function labelDurasi(hari: number | null | undefined): string {
  if (!hari) return '—';
  return DURASI_STANDAR.find((d) => d.hari === hari)?.label ?? `${hari} hari`;
}
