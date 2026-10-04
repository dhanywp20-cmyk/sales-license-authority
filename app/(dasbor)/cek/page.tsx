import { createClient } from '@supabase/supabase-js';
import { rahasiaTotp, cocokKode } from '@/lib/totp';
import { periksaToken, tandatangani } from '@/lib/kontrak/tanda-tangan.ts';
import { fiturDariPaket } from '@/lib/kontrak/kontrak.ts';

export const dynamic = 'force-dynamic';

/**
 * /cek — pemeriksaan konfigurasi Kantor Pusat (hanya setelah login).
 * Menampilkan HANYA benar/salah dan petunjuk perbaikan — tidak pernah
 * mencetak isi rahasia.
 */

interface Hasil { nama: string; ok: boolean; pesan: string }

async function periksa(): Promise<Hasil[]> {
  const h: Hasil[] = [];
  const env = (k: string) => (process.env[k] ?? '').trim();

  // ── Variabel lingkungan ──
  const url = env('SUPABASE_URL');
  const key = env('SUPABASE_SERVICE_ROLE_KEY');
  h.push({ nama: 'SUPABASE_URL', ok: /^https:\/\/[a-z0-9]+\.supabase\.co\/?$/.test(url),
    pesan: url ? (/^https:\/\/[a-z0-9]+\.supabase\.co\/?$/.test(url) ? 'Format benar.' : 'Harus persis seperti https://xxxx.supabase.co — tanpa /rest/v1 atau garis miring tambahan.') : 'Belum diisi.' });
  const kunciJwt = key.startsWith('eyJ');
  const kunciBaru = key.startsWith('sb_secret_');
  h.push({ nama: 'SUPABASE_SERVICE_ROLE_KEY', ok: kunciJwt || kunciBaru,
    pesan: !key ? 'Belum diisi.'
      : key.startsWith('sb_publishable_') || key.includes('anon') ? 'Ini kunci PUBLIK (anon/publishable). Pakai service_role / secret.'
      : kunciJwt ? 'Format service_role (legacy) terdeteksi.'
      : kunciBaru ? 'Format secret baru terdeteksi (lihat hasil koneksi di bawah).'
      : 'Format tidak dikenal. Salin ulang dari Supabase → Project Settings → API Keys.' });
  for (const k of ['LICENSE_PRIVATE_KEY', 'TELEGRAM_BOT_TOKEN', 'TELEGRAM_DEVELOPER_ID', 'TELEGRAM_WEBHOOK_SECRET', 'CENTRAL_ADMIN_SECRET', 'CRON_SECRET']) {
    h.push({ nama: k, ok: Boolean(env(k)), pesan: env(k) ? 'Terisi.' : 'Belum diisi (atau belum Redeploy setelah diisi).' });
  }
  {
    let ok = false, pesan = 'Belum diisi — login hanya dengan sandi. Jalankan `npm run totp`, isi di Vercel, lalu Redeploy.';
    try {
      if (rahasiaTotp()) { cocokKode(rahasiaTotp()!, '000000'); ok = true; pesan = 'Aktif — login meminta kode authenticator.'; }
    } catch { pesan = 'Nilainya bukan base32 yang sah. Buat ulang dengan `npm run totp`.'; }
    h.push({ nama: 'CENTRAL_ADMIN_TOTP_SECRET (2FA)', ok, pesan });
  }
  if (env('TELEGRAM_DEVELOPER_ID')) {
    const ok = env('TELEGRAM_DEVELOPER_ID').split(',').every((s) => /^\d+$/.test(s.trim()));
    h.push({ nama: 'TELEGRAM_DEVELOPER_ID (format)', ok, pesan: ok ? 'Angka.' : 'Harus ANGKA dari @userinfobot, bukan @username.' });
  }

  // ── Kunci tanda tangan ──
  if (env('LICENSE_PRIVATE_KEY')) {
    try {
      const crypto = await import('crypto');
      const priv = crypto.createPrivateKey({ key: Buffer.from(env('LICENSE_PRIVATE_KEY'), 'base64'), format: 'der', type: 'pkcs8' });
      const pub = crypto.createPublicKey(priv).export({ format: 'der', type: 'spki' }).toString('base64');
      const tok = tandatangani({ v: 1, deployment_id: 'CEK', license_id: 'CEK', company_name: 'cek', status: 'ACTIVE', package: 'STARTER',
        license_type: 'STANDARD', issued_at: null, starts_at: null, expires_at: null, grace_period_days: 7, warning_days: 30,
        features: fiturDariPaket('STARTER'), min_version: null, max_version: null, requests: [], verified_at: new Date().toISOString(), nonce: 'cek' },
      env('LICENSE_PRIVATE_KEY'));
      const sah = periksaToken(tok, pub).sah;
      h.push({ nama: 'Tanda tangan lisensi', ok: sah, pesan: sah ? `Berfungsi. Kunci publik pasangannya: ${pub}` : 'Gagal menandatangani.' });
    } catch {
      h.push({ nama: 'Tanda tangan lisensi', ok: false, pesan: 'LICENSE_PRIVATE_KEY tidak valid — salin ulang tanpa spasi/baris baru.' });
    }
  }

  // ── Database pusat ──
  if (url && key) {
    try {
      const db = createClient(url.replace(/\/+$/, ''), key, { auth: { persistSession: false } });
      const { error } = await db.from('deployments').select('id', { count: 'exact', head: true });
      if (!error) {
        h.push({ nama: 'Database pusat', ok: true, pesan: 'Terhubung, tabel ditemukan.' });
        const { error: e2 } = await db.rpc('la_claim_once', { p_key: `cek:${Date.now()}` });
        h.push({ nama: 'Fungsi SQL (la_*)', ok: !e2, pesan: e2 ? `Gagal: ${e2.message}. Jalankan ulang SQL 001 di SQL Editor.` : 'Tersedia.' });
        const { error: e3 } = await db.from('deployments').select('instance_hash', { head: true });
        h.push({ nama: 'SQL 002 (Kode Aktivasi)', ok: !e3, pesan: e3 ? 'Belum dijalankan. Jalankan supabase/migrations/002_kode_aktivasi.sql di SQL Editor.' : 'Terpasang.' });
        const { error: e4 } = await db.from('licenses').select('replaced_by, handover_code', { head: true });
        h.push({ nama: 'SQL 003 (Trial & ganti lisensi)', ok: !e4, pesan: e4 ? 'Belum dijalankan. Jalankan supabase/migrations/003_trial_dan_ganti_lisensi.sql di SQL Editor.' : 'Terpasang.' });
        const { error: e5 } = await db.from('licenses').select('activation_code_enc', { head: true });
        h.push({ nama: 'SQL 004 (simpan Kode Aktivasi)', ok: !e5, pesan: e5 ? 'Belum dijalankan. Jalankan supabase/migrations/004_simpan_kode_aktivasi.sql di SQL Editor.' : 'Terpasang.' });
      } else if (/relation .* does not exist|Could not find the table/i.test(error.message)) {
        h.push({ nama: 'Database pusat', ok: false, pesan: 'Terhubung, tetapi TABEL BELUM ADA. Jalankan supabase/migrations/001_license_authority.sql di SQL Editor Supabase.' });
      } else if (/JWT|Invalid API key|apikey|401|permission/i.test(error.message)) {
        h.push({ nama: 'Database pusat', ok: false, pesan: `Kunci ditolak (${error.message}). Pakai service_role dari Project Settings → API Keys → tab "Legacy API Keys" (diawali eyJ...).` });
      } else {
        h.push({ nama: 'Database pusat', ok: false, pesan: `Gagal: ${error.message}` });
      }
    } catch (e) {
      h.push({ nama: 'Database pusat', ok: false, pesan: `Tidak terjangkau: ${e instanceof Error ? e.message : 'unknown'}. Periksa SUPABASE_URL.` });
    }
  }

  // ── Telegram ──
  const tg = env('TELEGRAM_BOT_TOKEN');
  if (tg) {
    try {
      const me = await fetch(`https://api.telegram.org/bot${tg}/getMe`, { cache: 'no-store' }).then((r) => r.json());
      h.push({ nama: 'Bot Telegram', ok: Boolean(me.ok), pesan: me.ok ? `Token valid: @${me.result.username}` : 'Token DITOLAK Telegram — pakai token terbaru dari @BotFather.' });
      const wh = await fetch(`https://api.telegram.org/bot${tg}/getWebhookInfo`, { cache: 'no-store' }).then((r) => r.json());
      const u = wh?.result?.url ?? '';
      const okWh = u.endsWith('/api/telegram/webhook');
      h.push({ nama: 'Webhook Telegram', ok: okWh && !wh.result.last_error_message,
        pesan: !u ? 'Belum dipasang (buka link setWebhook).' : `${u}${wh.result.last_error_message ? ` — error: ${wh.result.last_error_message}` : ' — tanpa error.'}` });
    } catch {
      h.push({ nama: 'Bot Telegram', ok: false, pesan: 'Telegram tidak terjangkau dari server.' });
    }
  }
  return h;
}

export default async function HalamanCek() {
  const hasil = await periksa();
  const semua = hasil.every((x) => x.ok);
  return (
    <>
      <h1>Pemeriksaan Kantor Pusat</h1>
      <p className="muted">Hanya menampilkan benar/salah — isi rahasia tidak pernah ditampilkan.</p>
      <div className="notice" style={semua ? { background: '#e0f2e0', color: '#006b00' } : undefined}>
        {semua ? '✅ Semua pemeriksaan lulus.' : '❌ Ada yang perlu diperbaiki — lihat baris merah. Setelah mengubah Environment Variables, lakukan Redeploy.'}
      </div>
      <section className="card">
        <table>
          <thead><tr><th>Pemeriksaan</th><th>Hasil</th><th>Keterangan</th></tr></thead>
          <tbody>
            {hasil.map((x) => (
              <tr key={x.nama}>
                <td><b>{x.nama}</b></td>
                <td><span className={`badge ${x.ok ? 'ACTIVE' : 'EXPIRED'}`}>{x.ok ? 'OK' : 'SALAH'}</span></td>
                <td style={{ whiteSpace: 'normal', wordBreak: 'break-all' }}>{x.pesan}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="card">
        <h2>Cadangan data</h2>
        <p className="muted">
          Deployment, lisensi, permintaan, dan audit dalam satu berkas terenkripsi (hanya bisa dibuka dengan
          LICENSE_PRIVATE_KEY). Otomatis dikirim ke Telegram Developer setiap Senin. Pulihkan dengan
          <code> node scripts/pulihkan-cadangan.mjs &lt;berkas&gt;</code>.
        </p>
        <a className="tombol" href="/cadangan">⬇ Unduh cadangan sekarang</a>
      </section>
    </>
  );
}
