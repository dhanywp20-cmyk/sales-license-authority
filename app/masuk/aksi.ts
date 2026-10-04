'use server';

import crypto from 'crypto';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { db, rpc } from '@/lib/db';
import { COOKIE_SESI, UMUR_SESI_DETIK, buatTokenSesi, sandiBenar, usernameBenar } from '@/lib/sesi';
import { rahasiaTotp, cocokKode } from '@/lib/totp';
import { kirimKeDeveloper, esc, telegramAktif } from '@/lib/telegram';

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

/**
 * Jejak login berhasil (IP & perangkat) — tampil di Ringkasan, dan dikirim
 * ke Telegram Developer: login yang bukan Anda langsung ketahuan.
 */
async function catatLogin(): Promise<void> {
  const h = await headers();
  const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() || '—';
  const ua = (h.get('user-agent') ?? '').slice(0, 200);
  try {
    await db().from('processed_actions').insert({
      action_key: `login-ok:${new Date().toISOString()}:${crypto.randomUUID()}`,
      result: { ip, ua },
    });
  } catch { /* jejak gagal tidak menghalangi login */ }
  if (telegramAktif()) {
    await kirimKeDeveloper(`🔐 <b>Login Kantor Pusat</b>\nIP: <code>${esc(ip)}</code>\nPerangkat: ${esc(ua || '—')}\n\nBukan Anda? Ganti CENTRAL_ADMIN_SECRET di Vercel lalu Redeploy.`).catch(() => null);
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
  // Verifikasi dua langkah bila CENTRAL_ADMIN_TOTP_SECRET diisi. Langkah
  // waktu yang sudah dipakai ditandai di processed_actions → kode yang
  // tersadap tidak bisa dipakai ulang.
  const totp = rahasiaTotp();
  let kodeOk = true;
  if (totp) {
    const langkah = cocokKode(totp, String(f.get('kode') ?? ''));
    kodeOk = langkah !== null && userOk && sandiOk
      && await rpc<boolean>('la_claim_once', { p_key: `totp-login:${langkah}` }).catch(() => false);
  }
  if (!username || !sandi || !userOk || !sandiOk || !kodeOk) {
    try { await rpc('la_claim_once', { p_key: `login-gagal:${Date.now()}:${crypto.randomUUID()}` }); } catch { /* lihat jumlahGagal */ }
    await new Promise((r) => setTimeout(r, 800));
    return { galat: totp ? 'Username, kata sandi, atau kode authenticator salah.' : 'Username atau kata sandi salah.' };
  }
  await catatLogin();
  (await cookies()).set(COOKIE_SESI, await buatTokenSesi(), {
    httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: UMUR_SESI_DETIK,
  });
  redirect(tujuanAman(String(f.get('ke') ?? '/')));
}

export async function aksiKeluar() {
  (await cookies()).delete(COOKIE_SESI);
  redirect('/masuk');
}
