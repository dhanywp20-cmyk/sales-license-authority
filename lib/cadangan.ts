import crypto from 'crypto';
import { gzipSync, gunzipSync } from 'zlib';
import { db } from '@/lib/db';

/**
 * lib/cadangan.ts — cadangan data Kantor Pusat (deployment, lisensi, fitur,
 * permintaan, audit) dalam SATU berkas terenkripsi.
 *
 * Format .smpbak: "SMPBAK1" | iv(12) | tag(16) | AES-256-GCM(gzip(JSON)).
 * Kuncinya diturunkan dari LICENSE_PRIVATE_KEY, jadi berkas yang bocor
 * (mis. dari chat Telegram) tidak bisa dibuka tanpa env Vercel Kantor Pusat.
 * Pulihkan dengan: node scripts/pulihkan-cadangan.mjs <berkas>
 */

/** Urutan = urutan pemulihan (induk dulu, lalu yang merujuknya). */
export const TABEL_CADANGAN = [
  'deployments', 'licenses', 'license_features', 'license_requests', 'license_audit_logs',
] as const;

const MAGIC = Buffer.from('SMPBAK1');

export function kunciCadangan(rahasia = process.env.LICENSE_PRIVATE_KEY ?? ''): Buffer {
  if (!rahasia) throw new Error('LICENSE_PRIVATE_KEY belum diset.');
  return crypto.createHash('sha256').update(`smp-cadangan:${rahasia}`).digest();
}

export function sandikan(json: unknown, kunci = kunciCadangan()): Buffer {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', kunci, iv);
  const isi = Buffer.concat([c.update(gzipSync(Buffer.from(JSON.stringify(json)))), c.final()]);
  return Buffer.concat([MAGIC, iv, c.getAuthTag(), isi]);
}

export function bukaSandi(berkas: Buffer, kunci = kunciCadangan()): unknown {
  if (!berkas.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error('Bukan berkas cadangan Kantor Pusat.');
  const iv = berkas.subarray(7, 19), tag = berkas.subarray(19, 35), isi = berkas.subarray(35);
  const d = crypto.createDecipheriv('aes-256-gcm', kunci, iv);
  d.setAuthTag(tag);
  return JSON.parse(gunzipSync(Buffer.concat([d.update(isi), d.final()])).toString('utf8'));
}

export async function buatCadangan(): Promise<{ nama: string; isi: Buffer; jumlah: Record<string, number> }> {
  const data: Record<string, unknown[]> = {};
  const jumlah: Record<string, number> = {};
  for (const t of TABEL_CADANGAN) {
    const baris: unknown[] = [];
    for (let dari = 0; ; dari += 1000) {
      const { data: hal, error } = await db().from(t).select('*').range(dari, dari + 999);
      if (error) throw new Error(`${t}: ${error.message}`);
      baris.push(...(hal ?? []));
      if (!hal || hal.length < 1000) break;
    }
    data[t] = baris;
    jumlah[t] = baris.length;
  }
  const tgl = new Date().toISOString().slice(0, 10);
  return {
    nama: `cadangan-kantor-pusat-${tgl}.smpbak`,
    isi: sandikan({ versi: 1, dibuat: new Date().toISOString(), tabel: TABEL_CADANGAN, data }),
    jumlah,
  };
}
