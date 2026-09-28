/**
 * Sesi dashboard developer. Cookie berisi `<kedaluwarsa>.<HMAC>` yang
 * ditandatangani dengan CENTRAL_ADMIN_SECRET — tidak ada tabel sesi. Mengganti
 * CENTRAL_ADMIN_SECRET di Vercel otomatis mengeluarkan semua sesi.
 *
 * Hanya memakai Web Crypto supaya bisa dipanggil dari middleware (Edge).
 */

export const COOKIE_SESI = 'la_sesi';
export const UMUR_SESI_DETIK = 12 * 60 * 60;

function rahasia(): string | null {
  const r = process.env.CENTRAL_ADMIN_SECRET ?? '';
  return r.length >= 24 ? r : null;
}

export function dashboardAktif(): boolean {
  return rahasia() !== null;
}

async function hmacHex(pesan: string, kunci: string): Promise<string> {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(kunci),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const tanda = await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(pesan));
  return Array.from(new Uint8Array(tanda), (b) => b.toString(16).padStart(2, '0')).join('');
}

function samaPanjangTetap(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let beda = 0;
  for (let i = 0; i < a.length; i++) beda |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return beda === 0;
}

export async function buatTokenSesi(): Promise<string> {
  const r = rahasia();
  if (!r) throw new Error('CENTRAL_ADMIN_SECRET belum diset.');
  const sampai = Math.floor(Date.now() / 1000) + UMUR_SESI_DETIK;
  return `${sampai}.${await hmacHex(`la-sesi:${sampai}`, r)}`;
}

export async function sesiSah(token: string | undefined): Promise<boolean> {
  const r = rahasia();
  if (!r || !token) return false;
  const [sampai, tanda] = token.split('.');
  if (!/^\d{10}$/.test(sampai ?? '') || !/^[0-9a-f]{64}$/.test(tanda ?? '')) return false;
  if (Number(sampai) < Date.now() / 1000) return false;
  return samaPanjangTetap(tanda, await hmacHex(`la-sesi:${sampai}`, r));
}

/** Username login dashboard: env CENTRAL_ADMIN_USERNAME, bawaan `developer`. */
export function usernameAdmin(): string {
  return (process.env.CENTRAL_ADMIN_USERNAME ?? '').trim().toLowerCase() || 'developer';
}

export async function usernameBenar(username: string): Promise<boolean> {
  const [a, b] = await Promise.all([
    hmacHex(`la-user:${username.trim().toLowerCase()}`, 'banding'), hmacHex(`la-user:${usernameAdmin()}`, 'banding'),
  ]);
  return samaPanjangTetap(a, b);
}

/** Sandi yang diketik dibandingkan lewat hash, supaya panjangnya pun tidak bocor lewat waktu. */
export async function sandiBenar(sandi: string): Promise<boolean> {
  const r = rahasia();
  if (!r) return false;
  const [a, b] = await Promise.all([hmacHex(`la-sandi:${sandi}`, 'banding'), hmacHex(`la-sandi:${r}`, 'banding')]);
  return samaPanjangTetap(a, b);
}
