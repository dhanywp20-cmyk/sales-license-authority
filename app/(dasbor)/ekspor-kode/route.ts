import { NextResponse } from 'next/server';
import { LicenseService } from '@/lib/license-service';

export const dynamic = 'force-dynamic';

/** GET /ekspor-kode — CSV semua lisensi + Kode Aktivasi. Hanya setelah login (middleware). */
export async function GET() {
  const { baris, belumSql } = await LicenseService.eksporKode();
  if (belumSql) {
    return new NextResponse('Jalankan dulu supabase/migrations/004_simpan_kode_aktivasi.sql di SQL Editor Supabase Kantor Pusat.', { status: 409 });
  }
  const kolom = ['perusahaan', 'deployment', 'lisensi', 'status', 'jenis', 'paket', 'berakhir', 'kode_aktivasi'];
  const sel = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
  const csv = '﻿' + [kolom.join(','), ...baris.map((b) => kolom.map((k) => sel(b[k] ?? '')).join(','))].join('\r\n');
  const tgl = new Date().toISOString().slice(0, 10);
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="kode-aktivasi-${tgl}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
