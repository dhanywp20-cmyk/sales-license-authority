'use server';

import crypto from 'crypto';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { db, rpc } from '@/lib/db';
import { COOKIE_SESI, UMUR_SESI_DETIK, buatTokenSesi, sandiBenar, usernameBenar } from '@/lib/sesi';

const BATAS_GAGAL = 10;
const JENDELA_MENIT = 15;

/** Jumlah percobaan gagal 15 menit terakhir. Database bermasalah = tidak dibatasi (supaya /cek tetap bisa dibuka). */
async function jumlahGagal(): Promise<number> {
  try {
    const sejak = new Date(Date.now() - JENDELA_MENIT * 60_000).toISOString();
    const { count } = await db().from('processed_actions').select('action_key', { count: 'exact', head: true })
      .like('action_key', 'login-gagal:%').gte('created_at', sejak);
    return count ?? 0;
  } catch {
    return 0;
  }
}

function tujuanAman(ke: string): string {
  return ke.startsWith('/') && !ke.startsWith('//') && !ke.startsWith('/masuk') ? ke : '/';
}

export async function aksiMasuk(_: { galat?: string }, f: FormData): Promise<{ galat?: string }> {
  if ((await jumlahGagal()) >= BATAS_GAGAL) {
    return { galat: `Terlalu banyak percobaan gagal. Coba lagi dalam ${JENDELA_MENIT} menit.` };
  }
  const username = String(f.get('username') ?? '');
  const sandi = String(f.get('sandi') ?? '');
  // Keduanya selalu diperiksa, dan pesannya sama — tidak membocorkan mana yang salah.
  const [userOk, sandiOk] = await Promise.all([usernameBenar(username), sandiBenar(sandi)]);
  if (!username || !sandi || !userOk || !sandiOk) {
    try { await rpc('la_claim_once', { p_key: `login-gagal:${Date.now()}:${crypto.randomUUID()}` }); } catch { /* lihat jumlahGagal */ }
    await new Promise((r) => setTimeout(r, 800));
    return { galat: 'Username atau kata sandi salah.' };
  }
  cookies().set(COOKIE_SESI, await buatTokenSesi(), {
    httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: UMUR_SESI_DETIK,
  });
  redirect(tujuanAman(String(f.get('ke') ?? '/')));
}

export async function aksiKeluar() {
  cookies().delete(COOKIE_SESI);
  redirect('/masuk');
}
