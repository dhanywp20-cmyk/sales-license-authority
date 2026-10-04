import { NextResponse } from 'next/server';
import { buatCadangan } from '@/lib/cadangan';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** GET /cadangan — unduh cadangan terenkripsi sekarang. Hanya setelah login (middleware). */
export async function GET() {
  try {
    const c = await buatCadangan();
    return new NextResponse(new Uint8Array(c.isi), {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${c.nama}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    return new NextResponse(`Gagal membuat cadangan: ${e instanceof Error ? e.message : 'unknown'}`, { status: 500 });
  }
}
