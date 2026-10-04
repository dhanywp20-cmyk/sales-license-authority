// Membuka berkas cadangan Kantor Pusat (.smpbak) → SQL pemulihan.
//
//   LICENSE_PRIVATE_KEY="<sama dengan di Vercel>" node scripts/pulihkan-cadangan.mjs cadangan-....smpbak
//
// Menghasilkan <berkas>.sql: jalankan di SQL Editor Supabase Kantor Pusat
// (project baru: jalankan dulu migrasi 001–004). Baris yang sudah ada
// dilewati (ON CONFLICT DO NOTHING) — aman dijalankan pada database berisi.
import crypto from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

const berkas = process.argv[2];
const rahasia = process.env.LICENSE_PRIVATE_KEY ?? '';
if (!berkas || !rahasia) {
  console.error('Pakai: LICENSE_PRIVATE_KEY="..." node scripts/pulihkan-cadangan.mjs <berkas.smpbak>');
  process.exit(1);
}
const b = readFileSync(berkas);
if (b.subarray(0, 7).toString() !== 'SMPBAK1') { console.error('Bukan berkas cadangan Kantor Pusat.'); process.exit(1); }
const kunci = crypto.createHash('sha256').update(`smp-cadangan:${rahasia}`).digest();
let json;
try {
  const d = crypto.createDecipheriv('aes-256-gcm', kunci, b.subarray(7, 19));
  d.setAuthTag(b.subarray(19, 35));
  json = JSON.parse(gunzipSync(Buffer.concat([d.update(b.subarray(35)), d.final()])).toString('utf8'));
} catch {
  console.error('Gagal membuka: LICENSE_PRIVATE_KEY berbeda atau berkas rusak.');
  process.exit(1);
}

const tag = `$cadangan_${crypto.randomBytes(4).toString('hex')}$`;
const sql = [
  `-- Pemulihan Kantor Pusat dari cadangan ${json.dibuat}`,
  'BEGIN;',
  ...json.tabel.map((t) => {
    const baris = json.data[t] ?? [];
    return `-- ${t}: ${baris.length} baris\nINSERT INTO public.${t}\nSELECT * FROM jsonb_populate_recordset(NULL::public.${t}, ${tag}${JSON.stringify(baris)}${tag}::jsonb)\nON CONFLICT DO NOTHING;`;
  }),
  'COMMIT;',
].join('\n\n');
writeFileSync(`${berkas}.sql`, sql);
console.log(`Selesai: ${berkas}.sql`);
for (const t of json.tabel) console.log(`  ${t}: ${(json.data[t] ?? []).length} baris`);
