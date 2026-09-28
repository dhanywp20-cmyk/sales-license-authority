import { NextResponse, type NextRequest } from 'next/server';
import { adalahPaket, type Paket } from '@/lib/kontrak/kontrak.ts';
import { LicenseService } from '@/lib/license-service';
import { telegramAktif } from '@/lib/telegram';
import { terlaluSering } from '@/lib/http';

export const dynamic = 'force-dynamic';

function teks(v: unknown, maks: number): string {
  return typeof v === 'string' ? v.trim().slice(0, maks) : '';
}

/**
 * POST /api/v1/enroll — platform yang BELUM punya Kode Aktivasi mengajukan
 * lisensi. Endpoint ini hanya meneruskan pengajuan ke Telegram developer;
 * tidak menerbitkan apa pun dan tidak pernah mengembalikan kode/kunci.
 */
export async function POST(request: NextRequest) {
  const b = await request.json().catch(() => null) as Record<string, unknown> | null;
  const company = teks(b?.company, 160);
  const contact = teks(b?.contact, 120);
  const instance = typeof b?.instance_id === 'string' && /^[0-9a-f]{64}$/.test(b.instance_id) ? b.instance_id : '';
  const trial = b?.license_type === 'TRIAL';
  const days = b?.duration_days == null ? null : Number(b.duration_days);
  if (!b || company.length < 2 || contact.length < 3 || !instance || !adalahPaket(b.package)
      || (days !== null && (!Number.isInteger(days) || days < 1 || days > 3660))) {
    return NextResponse.json({ error: 'invalid', code: 'INVALID_REQUEST' }, { status: 400 });
  }
  if (!telegramAktif()) return NextResponse.json({ error: 'unavailable' }, { status: 503 });

  let h;
  try {
    h = await LicenseService.enroll({
      company, contact, requested_by: teks(b.requested_by, 120) || null, package: b.package as Paket, trial,
      days: trial ? null : days, notes: teks(b.notes, 500) || null, instance,
      dashboard: new URL(request.url).origin,
    });
  } catch {
    return NextResponse.json({ error: 'unavailable' }, { status: 503 });
  }
  if (!h.ok) return h.code === 'RATE_LIMITED' ? terlaluSering() : NextResponse.json({ error: 'unavailable' }, { status: 503 });
  return NextResponse.json({ ok: true }, { status: 202 });
}
