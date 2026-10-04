import { NextResponse, type NextRequest } from 'next/server';
import { LicenseService } from '@/lib/license-service';
import { cocokBearer } from '@/lib/http';
import { buatCadangan } from '@/lib/cadangan';
import { kirimBerkasKeDeveloper, telegramAktif } from '@/lib/telegram';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET /api/cron — harian (Vercel Cron, CRON_SECRET):
 *   1. peringatan kedaluwarsa ke Telegram developer
 *   2. setiap Senin (WIB): cadangan terenkripsi dikirim ke Telegram developer
 *      — salinan di luar Supabase bila project-nya terhapus/rusak.
 */
export async function GET(request: NextRequest) {
  if (!cocokBearer(request, process.env.CRON_SECRET)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const jumlah = await LicenseService.runExpiryNotices();

  let cadangan: string = 'dilewati';
  const hariWib = new Date(Date.now() + 7 * 3600_000).getUTCDay();
  if (telegramAktif() && (hariWib === 1 || request.nextUrl.searchParams.get('cadangan') === '1')) {
    try {
      const c = await buatCadangan();
      const ringkas = Object.entries(c.jumlah).map(([t, n]) => `${t}: ${n}`).join('\n');
      const ok = await kirimBerkasKeDeveloper(c.nama, c.isi,
        `🗄 <b>Cadangan mingguan Kantor Pusat</b>\n${ringkas}\n\nTerenkripsi — hanya bisa dibuka dengan LICENSE_PRIVATE_KEY (scripts/pulihkan-cadangan.mjs).`);
      cadangan = ok ? 'terkirim' : 'gagal-kirim';
    } catch (e) {
      console.error('[cron] cadangan gagal', e instanceof Error ? e.message : e);
      cadangan = 'gagal';
    }
  }
  return NextResponse.json({ ok: true, notices: jumlah, cadangan });
}
