import { NextResponse } from 'next/server';
import { LicenseService } from '@/lib/license-service';
import { bukuBertema } from '@/lib/excel-tema';
import { label, LABEL_STATUS } from '@/lib/label';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Baris = Record<string, string>;

/** GET /ekspor-kode — Excel bertema: semua lisensi + Kode Aktivasi. Hanya setelah login (middleware). */
export async function GET() {
  const { baris, belumSql } = await LicenseService.eksporKode();
  if (belumSql) {
    return new NextResponse('Jalankan dulu supabase/migrations/004_simpan_kode_aktivasi.sql di SQL Editor Supabase Kantor Pusat.', { status: 409 });
  }
  const tglIndo = (iso: string) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '—');
  const buku = await bukuBertema<Baris>({
    judul: 'Daftar Lisensi & Kode Aktivasi',
    subjudul: 'RAHASIA — berisi Kode Aktivasi. Jangan diteruskan ke pihak lain.',
    keterangan: [['Cakupan', 'Semua lisensi yang tercatat di Kantor Pusat']],
    kolom: [
      { judul: 'Perusahaan', lebar: 24, nilai: (b) => b.perusahaan },
      { judul: 'Deployment', lebar: 16, nilai: (b) => b.deployment },
      { judul: 'Lisensi', lebar: 18, nilai: (b) => b.lisensi },
      { judul: 'Status', lebar: 14, nilai: (b) => label(LABEL_STATUS, b.status), rata: 'center' },
      { judul: 'Jenis', lebar: 12, nilai: (b) => b.jenis, rata: 'center' },
      { judul: 'Paket', lebar: 13, nilai: (b) => b.paket, rata: 'center' },
      { judul: 'Berakhir', lebar: 12, nilai: (b) => tglIndo(b.berakhir), rata: 'center' },
      { judul: 'Kode Aktivasi', lebar: 60, nilai: (b) => b.kode_aktivasi || '—', kode: true },
    ],
    baris: baris as Baris[],
    catatanKaki: 'Kode Aktivasi bersifat rahasia dan hanya diberikan manual oleh Developer kepada pelanggan yang berhak.',
  });
  const tgl = new Date().toISOString().slice(0, 10);
  return new NextResponse(new Uint8Array(buku), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="kode-aktivasi-${tgl}.xlsx"`,
      'Cache-Control': 'no-store',
    },
  });
}
