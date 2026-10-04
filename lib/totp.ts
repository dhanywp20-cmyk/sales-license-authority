import crypto from 'node:crypto';

/**
 * lib/totp.ts — verifikasi dua langkah login Developer (RFC 6238: SHA1,
 * 6 digit, 30 detik, toleransi ±1 langkah). Rahasianya di env
 * CENTRAL_ADMIN_TOTP_SECRET (base32, buat dengan `npm run totp`).
 * Tanpa env itu, login tetap sandi saja — tampil peringatan di /cek.
 */

const ABJAD = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Enc(buf: Uint8Array): string {
  let bit = 0, nilai = 0, out = '';
  for (const b of buf) {
    nilai = (nilai << 8) | b; bit += 8;
    while (bit >= 5) { out += ABJAD[(nilai >>> (bit - 5)) & 31]; bit -= 5; }
  }
  if (bit > 0) out += ABJAD[(nilai << (5 - bit)) & 31];
  return out;
}

function base32Dec(teks: string): Buffer {
  let bit = 0, nilai = 0;
  const out: number[] = [];
  for (const c of teks.toUpperCase().replace(/[\s=-]/g, '')) {
    const i = ABJAD.indexOf(c);
    if (i < 0) throw new Error('CENTRAL_ADMIN_TOTP_SECRET bukan base32 yang sah.');
    nilai = (nilai << 5) | i; bit += 5;
    if (bit >= 8) { out.push((nilai >>> (bit - 8)) & 255); bit -= 8; }
  }
  return Buffer.from(out);
}

export function kodePadaLangkah(rahasia: string, langkah: number): string {
  const pesan = Buffer.alloc(8);
  pesan.writeBigUInt64BE(BigInt(langkah));
  const h = crypto.createHmac('sha1', base32Dec(rahasia)).update(pesan).digest();
  const o = h[h.length - 1] & 15;
  const angka = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(angka % 1_000_000).padStart(6, '0');
}

export function rahasiaTotp(): string | null {
  const r = (process.env.CENTRAL_ADMIN_TOTP_SECRET ?? '').replace(/\s/g, '');
  return r.length >= 16 ? r : null;
}

/** Langkah waktu yang cocok, atau null. Pemanggil menandai langkahnya terpakai. */
export function cocokKode(rahasia: string, kode: string, ms = Date.now()): number | null {
  const k = kode.replace(/\s/g, '');
  if (!/^\d{6}$/.test(k)) return null;
  const kini = Math.floor(ms / 30_000);
  for (const d of [0, -1, 1]) {
    if (crypto.timingSafeEqual(Buffer.from(kodePadaLangkah(rahasia, kini + d)), Buffer.from(k))) return kini + d;
  }
  return null;
}
