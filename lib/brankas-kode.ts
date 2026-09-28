import crypto from 'crypto';

/**
 * Enkripsi Kode Aktivasi untuk disimpan di database pusat (AES-256-GCM).
 * Kunci diturunkan dari LICENSE_PRIVATE_KEY: tanpa env Vercel Kantor Pusat,
 * isi kolom activation_code_enc tidak bisa dibuka.
 */
function kunci(): Buffer {
  const rahasia = process.env.LICENSE_PRIVATE_KEY ?? '';
  if (!rahasia) throw new Error('LICENSE_PRIVATE_KEY belum diset.');
  return crypto.createHash('sha256').update(`smp-brankas-kode:${rahasia}`).digest();
}

export function kunciKode(kode: string): string {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', kunci(), iv);
  const isi = Buffer.concat([c.update(kode, 'utf8'), c.final()]);
  return `v1.${iv.toString('base64url')}.${c.getAuthTag().toString('base64url')}.${isi.toString('base64url')}`;
}

export function bukaKode(simpan: string | null | undefined): string | null {
  if (!simpan) return null;
  const [v, iv, tag, isi] = simpan.split('.');
  if (v !== 'v1' || !iv || !tag || !isi) return null;
  try {
    const d = crypto.createDecipheriv('aes-256-gcm', kunci(), Buffer.from(iv, 'base64url'));
    d.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([d.update(Buffer.from(isi, 'base64url')), d.final()]).toString('utf8');
  } catch {
    return null; // LICENSE_PRIVATE_KEY diganti atau data rusak
  }
}
