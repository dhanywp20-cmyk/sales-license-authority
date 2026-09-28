import { NextResponse, type NextRequest } from 'next/server';
import { LicenseService } from '@/lib/license-service';
import { terbitkanToken } from '@/lib/token';
import { identitasDeployment, terlaluSering, tidakDiizinkan } from '@/lib/http';

export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/verify — deployment menanyakan lisensinya (§29).
 *
 * Autentikasi: kode deployment + kode lisensi + kunci deployment (Bearer)
 * harus cocok bersama; pusat hanya menyimpan hash kuncinya. Semua
 * ketidakcocokan dijawab 401 yang sama — tidak bisa dipakai menebak kode.
 * Respons berisi token Ed25519 yang memuat nonce dari permintaan, sehingga
 * respons lama tidak bisa diputar ulang (§15, §50).
 */
export async function POST(request: NextRequest) {
  const id = await identitasDeployment(request);
  if (!id.ok) return id.res;

  const nonce = typeof id.badan.nonce === 'string' && /^[0-9a-f]{32}$/.test(id.badan.nonce) ? id.badan.nonce : null;
  if (!nonce) return tidakDiizinkan();

  // Sidik jari platform pemakai kode (hash Supabase pelanggan) — kode diikat ke platform pertama.
  const instance = typeof id.badan.instance_id === 'string' && /^[0-9a-f]{64}$/.test(id.badan.instance_id)
    ? id.badan.instance_id : null;

  let hasil;
  try {
    hasil = await LicenseService.verify(id.deployment, id.license, id.kunci, id.versi, instance);
  } catch {
    return NextResponse.json({ error: 'unavailable' }, { status: 503 });
  }
  if (!hasil.ok) {
    if (hasil.code === 'INSTANCE_MISMATCH' || hasil.code === 'PLATFORM_TAKEN') {
      return NextResponse.json({ error: 'in_use', code: hasil.code }, { status: 409 });
    }
    return hasil.code === 'RATE_LIMITED' ? terlaluSering() : tidakDiizinkan();
  }

  return NextResponse.json(
    { token: terbitkanToken(hasil.license!, hasil.requests ?? [], nonce, hasil.handover_code ?? null) },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
