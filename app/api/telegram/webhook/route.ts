import { NextResponse, type NextRequest } from 'next/server';
import { PAKET, adalahKunciFitur, type Paket } from '@/lib/kontrak/kontrak.ts';
import { rpc } from '@/lib/db';
import { LicenseService } from '@/lib/license-service';
import {
  TEKS_BANTUAN, balas, bolehBertindak, cocokRahasiaWebhook, esc, jawabCallback, lepasTombol,
  papanKonfirmasiCabut, papanLisensi, papanPermintaan, teksHasil, teksLisensi, tgl,
} from '@/lib/telegram';
import type { HasilAksi, Pelaku } from '@/lib/types';

export const dynamic = 'force-dynamic';

/**
 * POST /api/telegram/webhook — antarmuka persetujuan developer (§19–§21, §50).
 *
 * Lapisan pemeriksaan, berurutan:
 *   1. Header X-Telegram-Bot-Api-Secret-Token harus cocok (hanya Telegram yang tahu).
 *   2. update_id diklaim sekali — pengiriman ulang Telegram tidak diproses dua kali.
 *   3. from.id harus ada di allowlist TELEGRAM_DEVELOPER_ID (angka, bukan username).
 *   4. callback_data / perintah dicocokkan ke pola ketat; sisanya diabaikan.
 *   5. Tindakan dijalankan lewat LicenseService (idempoten per tombol) dan diaudit.
 *
 * Selalu menjawab 200 setelah lapisan 1 lolos, supaya Telegram tidak
 * mengirim ulang update yang memang sengaja diabaikan.
 */

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const LIC = '[A-Z0-9][A-Z0-9-]{3,40}';
const POLA_CALLBACK: [RegExp, string][] = [
  [new RegExp(`^ap:(${UUID})$`), 'ap'],
  [new RegExp(`^rj:(${UUID})$`), 'rj'],
  [new RegExp(`^in:(${LIC})$`), 'in'],
  [new RegExp(`^ex:(${LIC}):(30|90|365):([0-9a-f]{6})$`), 'ex'],
  [new RegExp(`^su:(${LIC}):([0-9a-f]{6})$`), 'su'],
  [new RegExp(`^re:(${LIC}):([0-9a-f]{6})$`), 're'],
  [new RegExp(`^rv:(${LIC})$`), 'rv'],
  [new RegExp(`^rk:(${LIC}):([0-9a-f]{6})$`), 'rk'],
  [new RegExp(`^pk:(${LIC}):(STARTER|PROFESSIONAL|BUSINESS|ENTERPRISE):([0-9a-f]{6})$`), 'pk'],
  [new RegExp(`^tf:(${LIC}):([0-9a-f]{6})$`), 'tf'],
  [new RegExp(`^ak:(${LIC}):([0-9a-f]{6})$`), 'ak'],
];

interface TgPengguna { id: number }
interface TgPesan { message_id: number; chat: { id: number }; from?: TgPengguna; text?: string }
interface TgUpdate {
  update_id: number;
  message?: TgPesan;
  callback_query?: { id: string; from: TgPengguna; data?: string; message?: TgPesan };
}

function ringkas(h: HasilAksi): string {
  if (h.duplicate) return 'Sudah diproses sebelumnya.';
  if (h.unchanged) return 'Tidak ada perubahan.';
  if (h.ok) return 'Berhasil.';
  const peta: Record<string, string> = {
    REQUEST_NOT_PENDING: `Permintaan sudah ${h.status ?? 'diproses'}.`,
    REQUEST_NOT_FOUND: 'Permintaan tidak ditemukan.',
    LICENSE_NOT_FOUND: 'Lisensi tidak ditemukan.',
    LICENSE_REVOKED: 'Lisensi sudah dicabut permanen.',
    LICENSE_REPLACED: 'Lisensi ini sudah DIGANTI lisensi baru — kelola lisensi penggantinya.',
    INVALID_DURATION: 'Durasi tidak sah.',
    INVALID_TYPE: 'Jenis lisensi tidak sah.',
    NOT_SUSPENDED: 'Lisensi tidak sedang ditangguhkan.',
    INVALID_FEATURE: 'Fitur tidak dikenal.',
    INVALID_PACKAGE: 'Paket tidak dikenal.',
  };
  return peta[h.code ?? ''] ?? `Gagal (${h.code ?? 'unknown'}).`;
}

export async function POST(request: NextRequest) {
  if (!cocokRahasiaWebhook(request.headers.get('x-telegram-bot-api-secret-token'))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const u = await request.json().catch(() => null) as TgUpdate | null;
  if (!u || !Number.isSafeInteger(u.update_id)) return NextResponse.json({ ok: true });

  // Pengiriman ulang update yang sama (mis. timeout jaringan) diabaikan.
  let baru: boolean;
  try {
    baru = await rpc<boolean>('la_claim_once', { p_key: `tg:update:${u.update_id}` });
  } catch (e) {
    // Database pusat tidak terjangkau: SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY
    // salah, atau SQL 001 belum dijalankan. Dicatat supaya tidak diam-diam.
    console.error('[telegram] database pusat gagal diakses:', e instanceof Error ? e.message : 'unknown');
    return NextResponse.json({ ok: true });
  }
  if (!baru) return NextResponse.json({ ok: true });

  try {
    if (u.callback_query) await tanganiCallback(u.callback_query);
    else if (u.message?.text) await tanganiPerintah(u.message);
  } catch (e) {
    console.error('[telegram] gagal memproses update', e instanceof Error ? e.message : 'unknown');
  }
  return NextResponse.json({ ok: true });
}

async function tanganiCallback(cb: NonNullable<TgUpdate['callback_query']>) {
  if (!bolehBertindak(cb.from?.id)) {
    console.warn(`[telegram] tindakan ditolak dari pengguna ${cb.from?.id}`);
    await jawabCallback(cb.id, 'Tidak diizinkan.');
    return;
  }
  const data = cb.data ?? '';
  const cocok = POLA_CALLBACK.map(([re, jenis]) => [re.exec(data), jenis] as const).find(([m]) => m);
  if (!cocok) { await jawabCallback(cb.id, 'Tombol tidak dikenal.'); return; }
  const [m, jenis] = cocok as [RegExpExecArray, string];

  const pelaku: Pelaku = { nama: `telegram:${cb.from.id}`, via: 'telegram' };
  const chat = cb.message?.chat.id;
  const pesan = cb.message?.message_id;
  // Kunci idempotensi = isi tombol (memuat nonce unik per papan) — ketukan ganda aman.
  const kunci = `tg:cb:${data}`;

  let h: HasilAksi | null = null;
  switch (jenis) {
    case 'ap': h = await LicenseService.approve(m[1], pelaku); break;
    case 'rj': h = await LicenseService.reject(m[1], null, pelaku); break;
    case 'ex': h = await LicenseService.extend(m[1], Number(m[2]), pelaku, kunci); break;
    case 'su': h = await LicenseService.suspend(m[1], pelaku, kunci); break;
    case 're': h = await LicenseService.reactivate(m[1], pelaku, kunci); break;
    case 'rk': h = await LicenseService.revoke(m[1], pelaku, kunci, 'Dicabut lewat Telegram'); break;
    case 'pk': h = await LicenseService.setPackage(m[1], m[2] as Paket, pelaku, kunci); break;
    case 'ak': {
      const info = await LicenseService.get(m[1]);
      h = info && info.license_code === m[1]
        ? await LicenseService.activate(m[1], info.license_type === 'TRIAL' ? 14 : 365, pelaku)
        : { ok: false, code: 'LICENSE_NOT_FOUND' };
      break;
    }
    case 'tf': {
      // Trial → penuh: lisensi baru berjenis STANDAR, paket & fitur sama, 1 tahun.
      const info = await LicenseService.get(m[1]);
      h = info && info.license_code === m[1]
        ? await LicenseService.setPackage(m[1], info.package, pelaku, kunci, info.features, 365, 'STANDARD')
        : { ok: false, code: 'LICENSE_NOT_FOUND' };
      break;
    }
    case 'rv':
      await jawabCallback(cb.id, 'Konfirmasi diperlukan.');
      if (chat) await balas(chat, `⛔ Cabut lisensi <code>${esc(m[1])}</code> secara PERMANEN?`, papanKonfirmasiCabut(m[1]));
      return;
    case 'in': {
      await jawabCallback(cb.id, 'OK');
      const info = await LicenseService.get(m[1]);
      if (chat) await balas(chat, info ? teksLisensi(info) : 'Lisensi tidak ditemukan.', info ? papanLisensi(info) : undefined);
      return;
    }
  }

  if (!h) return;
  await jawabCallback(cb.id, ringkas(h));
  // Tombol yang sudah dipakai dilepas supaya tidak diketuk lagi; papan
  // lisensi yang masih relevan dikirim ulang dengan nonce baru.
  if (chat && pesan && (h.ok || h.code === 'REQUEST_NOT_PENDING')) await lepasTombol(chat, pesan);
  if (chat && !h.ok && !h.duplicate) await balas(chat, esc(ringkas(h)));
}

async function tanganiPerintah(msg: TgPesan) {
  const chat = msg.chat.id;
  if (!bolehBertindak(msg.from?.id)) {
    // Tidak membocorkan apa pun ke pengirim tak dikenal.
    console.warn(`[telegram] perintah ditolak dari pengguna ${msg.from?.id} — bila ini ID Anda, isi TELEGRAM_DEVELOPER_ID dengan angka ini`);
    return;
  }
  const pelaku: Pelaku = { nama: `telegram:${msg.from!.id}`, via: 'telegram' };
  const [perintahMentah, ...arg] = (msg.text ?? '').trim().split(/\s+/);
  const perintah = perintahMentah.toLowerCase().replace(/@.*$/, '');
  const kode = (arg[0] ?? '').toUpperCase();

  const hasilKe = async (h: HasilAksi) => {
    // Pemberitahuan sukses sudah dikirim LicenseService; di sini hanya kegagalan.
    if (!h.ok || h.duplicate || h.unchanged) await balas(chat, esc(ringkas(h)));
  };

  switch (perintah) {
    case '/start':
    case '/help':
      await balas(chat, TEKS_BANTUAN);
      return;

    case '/pending': {
      const daftar = await LicenseService.pendingRequests();
      if (daftar.length === 0) { await balas(chat, 'Tidak ada permintaan yang menunggu.'); return; }
      for (const r of daftar.slice(0, 10)) {
        const d = r.deployments;
        await balas(chat,
          `🔐 <b>${esc(d?.company_name)}</b>\n<code>${esc(d?.deployment_code)}</code>\n${esc(r.kind)} · ${esc(r.requested_package)} · ${r.duration_days ?? '—'} hari\n${tgl(r.requested_at)}\n<code>${esc(r.id)}</code>`,
          papanPermintaan(r.id));
      }
      return;
    }

    case '/list': {
      const saring = (arg[0] ?? '').toUpperCase();
      const peta: Record<string, string> = { ACTIVE: 'ACTIVE', PENDING: 'PENDING', EXPIRING: 'EXPIRING_SOON', EXPIRED: 'EXPIRED', SUSPENDED: 'SUSPENDED', REVOKED: 'REVOKED', REPLACED: 'REPLACED' };
      const semua = await LicenseService.list();
      const pilih = saring && peta[saring] ? semua.filter((l) => l.status_efektif === peta[saring]) : semua.filter((l) => l.status_efektif !== 'REPLACED');
      if (pilih.length === 0) { await balas(chat, 'Tidak ada lisensi.'); return; }
      await balas(chat, pilih.slice(0, 40).map((l) =>
        `• <b>${esc(l.company_name)}</b> <code>${esc(l.license_code)}</code> ${esc(l.package)} · ${esc(l.status_efektif)} · s/d ${tgl(l.expires_at)}`).join('\n'));
      return;
    }

    case '/info': {
      const info = kode ? await LicenseService.get(kode) : null;
      await balas(chat, info ? teksLisensi(info) : 'Lisensi tidak ditemukan.', info ? papanLisensi(info) : undefined);
      return;
    }

    case '/approve': {
      if (!new RegExp(`^${UUID}$`, 'i').test(arg[0] ?? '')) { await balas(chat, 'Format: /approve REQUEST_ID'); return; }
      await hasilKe(await LicenseService.approve(arg[0].toLowerCase(), pelaku));
      return;
    }

    case '/reject': {
      if (!new RegExp(`^${UUID}$`, 'i').test(arg[0] ?? '')) { await balas(chat, 'Format: /reject REQUEST_ID [alasan]'); return; }
      const alasan = arg.slice(1).join(' ').slice(0, 500) || null;
      await hasilKe(await LicenseService.reject(arg[0].toLowerCase(), alasan, pelaku));
      return;
    }

    case '/extend': {
      const hari = Number(arg[1]);
      if (!kode || !Number.isInteger(hari) || hari < 1 || hari > 3660) { await balas(chat, 'Format: /extend KODE HARI'); return; }
      const info = await LicenseService.get(kode);
      if (!info) { await balas(chat, 'Lisensi tidak ditemukan.'); return; }
      await hasilKe(await LicenseService.extend(info.license_code, hari, pelaku));
      return;
    }

    case '/suspend':
    case '/reactivate':
    case '/revoke': {
      const info = kode ? await LicenseService.get(kode) : null;
      if (!info) { await balas(chat, `Format: ${perintah} KODE`); return; }
      if (perintah === '/revoke') {
        await balas(chat, `⛔ Cabut lisensi <code>${esc(info.license_code)}</code> (${esc(info.company_name)}) secara PERMANEN?`, papanKonfirmasiCabut(info.license_code));
        return;
      }
      const alasan = arg.slice(1).join(' ').slice(0, 500) || null;
      await hasilKe(perintah === '/suspend'
        ? await LicenseService.suspend(info.license_code, pelaku, null, alasan)
        : await LicenseService.reactivate(info.license_code, pelaku));
      return;
    }

    case '/unbind': {
      const info = kode ? await LicenseService.get(kode) : null;
      if (!info) { await balas(chat, 'Format: /unbind KODE'); return; }
      const h = await LicenseService.resetInstance(info.license_code, pelaku);
      await balas(chat, h.ok ? `🔓 Ikatan platform <code>${esc(info.license_code)}</code> dilepas. Kode Aktivasi bisa dipakai di platform baru.` : esc(ringkas(h)));
      return;
    }

    case '/package': {
      const paket = (arg[1] ?? '').toUpperCase();
      const info = kode ? await LicenseService.get(kode) : null;
      if (!info || !(PAKET as readonly string[]).includes(paket) || paket === 'CUSTOM') {
        await balas(chat, 'Format: /package KODE STARTER|PROFESSIONAL|BUSINESS|ENTERPRISE'); return;
      }
      await hasilKe(await LicenseService.setPackage(info.license_code, paket as Paket, pelaku));
      return;
    }

    case '/feature': {
      const fitur = (arg[1] ?? '').toLowerCase();
      const nilai = (arg[2] ?? '').toLowerCase();
      const info = kode ? await LicenseService.get(kode) : null;
      if (!info || !adalahKunciFitur(fitur) || !['on', 'off'].includes(nilai)) {
        await balas(chat, 'Format: /feature KODE fitur on|off'); return;
      }
      const h = await LicenseService.setFeature(info.license_code, fitur, nilai === 'on', pelaku);
      await hasilKe(h);
      if (h.ok && !teksHasil(h)) await balas(chat, 'Fitur diperbarui.');
      return;
    }

    default:
      await balas(chat, TEKS_BANTUAN);
  }
}
