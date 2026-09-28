import crypto from 'crypto';
import {
  KUNCI_FITUR, adalahKunciFitur, adalahPaket, fiturDariPaket, normalisasiFitur, statusEfektif,
  type KunciFitur, type Paket, type RingkasanPermintaan,
} from '@/lib/kontrak/kontrak.ts';
import { buatKodeAktivasi, hashKunciDeployment } from '@/lib/kontrak/tanda-tangan.ts';
import { db, rpc } from './db';
import {
  kirimKeDeveloper, papanPermintaan, teksHasil, teksKedaluwarsa, teksPengajuanBaru, teksPermintaanBaru,
} from './telegram';
import type { HasilAksi, HasilVerifikasi, InfoLisensi, Pelaku } from './types';

export interface PermintaanMenunggu {
  id: string;
  kind: string;
  requested_package: Paket;
  requested_features: unknown;
  duration_days: number | null;
  notes: string | null;
  requested_by: string | null;
  requested_at: string;
  licenses: { license_code: string } | null;
  deployments: { deployment_code: string; company_name: string } | null;
}

export interface BarisAudit {
  id: number;
  action: string;
  previous_state: unknown;
  new_state: unknown;
  performed_by: string;
  performed_via: string;
  reason: string | null;
  created_at: string;
}

export type BarisAuditTerbaru = BarisAudit & {
  licenses: { license_code: string } | null;
  deployments: { company_name: string } | null;
};

export type BarisDaftar = InfoLisensi & { status_efektif: string; jumlah_fitur: number; pending_request: string | null };

/**
 * LicenseService — SATU-SATUNYA jalur perubahan lisensi (§48).
 *
 *   Telegram APPROVE ─┐
 *                     ├─► LicenseService.approve() ─► la_approve_request() ─► DB + audit ─► notifikasi
 *   Web APPROVE ──────┘
 *
 * Aturan transisi, penguncian baris, dan idempotensi hidup di fungsi SQL
 * (migrasi 001). Layanan ini menurunkan peta fitur dari preset paket (kontrak
 * bersama) dan mengirim pemberitahuan Telegram setelah perubahan berhasil.
 */

async function beritahu(h: HasilAksi): Promise<HasilAksi> {
  if (h.ok && !h.duplicate && !h.unchanged) {
    const t = teksHasil(h);
    if (t) await kirimKeDeveloper(t);
  }
  return h;
}

function fiturUntuk(paket: Paket, custom: unknown): Record<KunciFitur, boolean> {
  return fiturDariPaket(paket, paket === 'CUSTOM' ? normalisasiFitur(custom) : undefined);
}

export const LicenseService = {
  /* ── Jalur deployment ───────────────────────────────────────────────── */

  async verify(deployment: string, license: string, kunci: string, versi: string, instance: string | null): Promise<HasilVerifikasi> {
    return rpc<HasilVerifikasi>('la_verify', {
      p_deployment: deployment, p_license: license, p_key_hash: hashKunciDeployment(kunci), p_app_version: versi,
      p_instance: instance,
    });
  },

  /** Lepas ikatan Kode Aktivasi dari platform lama (mis. pelanggan pindah server). */
  async resetInstance(licenseCode: string, pelaku: Pelaku): Promise<HasilAksi> {
    return rpc<HasilAksi>('la_reset_instance', { p_license_code: licenseCode, p_actor: pelaku.nama, p_via: pelaku.via });
  },

  async createRequest(
    deployment: string, license: string, kunci: string,
    m: { kind: string; requested_package: Paket; requested_features?: unknown; duration_days: number | null; notes: string | null; requested_by: string | null },
  ): Promise<{ ok: boolean; code?: string; request_id?: string; license?: InfoLisensi }> {
    const h = await rpc<{ ok: boolean; code?: string; request_id?: string; license?: InfoLisensi }>('la_create_request', {
      p_deployment: deployment, p_license: license, p_key_hash: hashKunciDeployment(kunci),
      p_kind: m.kind, p_package: m.requested_package,
      p_features: m.requested_package === 'CUSTOM' ? normalisasiFitur(m.requested_features) : null,
      p_duration: m.duration_days, p_notes: m.notes, p_requested_by: m.requested_by,
    });
    if (h.ok && h.request_id && h.license) {
      const msg = await kirimKeDeveloper(
        teksPermintaanBaru(h.license, { id: h.request_id, ...m }),
        papanPermintaan(h.request_id),
      );
      if (msg) await db().from('license_requests').update({ telegram_message_id: msg }).eq('id', h.request_id);
    }
    return h;
  },

  async cancelRequest(deployment: string, license: string, kunci: string, requestId: string) {
    return rpc<{ ok: boolean; code?: string }>('la_cancel_request', {
      p_deployment: deployment, p_license: license, p_key_hash: hashKunciDeployment(kunci), p_request: requestId,
    });
  },

  /* ── Tindakan developer ─────────────────────────────────────────────── */

  async approve(requestId: string, pelaku: Pelaku, kunciAksi: string | null = null): Promise<HasilAksi> {
    const { data: r } = await db().from('license_requests')
      .select('kind, status, requested_package, requested_features, duration_days, licenses(license_code, status, license_type)')
      .eq('id', requestId).maybeSingle();
    if (!r) return { ok: false, code: 'REQUEST_NOT_FOUND' };
    if (r.status !== 'PENDING_APPROVAL') return { ok: false, code: 'REQUEST_NOT_PENDING', status: r.status as string };
    const lis = r.licenses as unknown as { license_code: string; status: string; license_type: string } | null;

    // Ganti paket, atau lisensi penuh untuk platform yang sudah berjalan (mis.
    // trial) = LISENSI BARU. Lisensi lama diganti dan tidak bisa dipakai lagi.
    const perluBaru = lis && lis.status !== 'PENDING'
      && (r.kind === 'CHANGE_PACKAGE' || r.kind === 'NEW');
    if (perluBaru) {
      const h = await this.reissue(lis!.license_code, r.requested_package as Paket, r.requested_features,
        r.kind === 'NEW' ? (r.duration_days as number | null) ?? 365 : null,
        r.kind === 'NEW' ? 'STANDARD' : null, pelaku, kunciAksi ?? `req:${requestId}`, `Permintaan ${requestId}`);
      if (h.ok && !h.duplicate) await rpc('la_mark_request', { p_request: requestId, p_actor: pelaku.nama, p_via: pelaku.via });
      return h;
    }

    const fitur = r.kind === 'EXTENSION' ? {} : fiturUntuk(r.requested_package as Paket, r.requested_features);
    return beritahu(await rpc<HasilAksi>('la_approve_request', {
      p_request: requestId, p_features: fitur, p_actor: pelaku.nama, p_via: pelaku.via, p_action_key: kunciAksi,
    }));
  },

  async reject(requestId: string, alasan: string | null, pelaku: Pelaku, kunciAksi: string | null = null): Promise<HasilAksi> {
    return beritahu(await rpc<HasilAksi>('la_reject_request', {
      p_request: requestId, p_reason: alasan, p_actor: pelaku.nama, p_via: pelaku.via, p_action_key: kunciAksi,
    }));
  },

  async extend(licenseCode: string, hari: number, pelaku: Pelaku, kunciAksi: string | null = null, alasan: string | null = null): Promise<HasilAksi> {
    if (await this.sudahDiganti(licenseCode)) return { ok: false, code: 'LICENSE_REPLACED' };
    return beritahu(await rpc<HasilAksi>('la_extend', {
      p_license_code: licenseCode, p_days: hari, p_actor: pelaku.nama, p_via: pelaku.via,
      p_action_key: kunciAksi, p_reason: alasan,
    }));
  },

  async suspend(licenseCode: string, pelaku: Pelaku, kunciAksi: string | null = null, alasan: string | null = null) {
    return this.setStatus(licenseCode, 'SUSPEND', pelaku, kunciAksi, alasan);
  },
  async reactivate(licenseCode: string, pelaku: Pelaku, kunciAksi: string | null = null) {
    return this.setStatus(licenseCode, 'REACTIVATE', pelaku, kunciAksi, null);
  },
  async revoke(licenseCode: string, pelaku: Pelaku, kunciAksi: string | null = null, alasan: string | null = null) {
    return this.setStatus(licenseCode, 'REVOKE', pelaku, kunciAksi, alasan);
  },

  async setStatus(licenseCode: string, aksi: 'SUSPEND' | 'REACTIVATE' | 'REVOKE', pelaku: Pelaku, kunciAksi: string | null, alasan: string | null): Promise<HasilAksi> {
    if (await this.sudahDiganti(licenseCode)) return { ok: false, code: 'LICENSE_REPLACED' };
    return beritahu(await rpc<HasilAksi>('la_set_status', {
      p_license_code: licenseCode, p_action: aksi, p_actor: pelaku.nama, p_via: pelaku.via,
      p_action_key: kunciAksi, p_reason: alasan,
    }));
  },

  async sudahDiganti(licenseCode: string): Promise<boolean> {
    const { data } = await db().from('licenses').select('status').eq('license_code', licenseCode).maybeSingle();
    return data?.status === 'REPLACED';
  },

  /**
   * TERBITKAN LISENSI BARU menggantikan yang lama (upgrade, downgrade, ganti
   * paket/fitur, trial → penuh). Kode & kunci baru; lisensi lama berstatus
   * DIGANTI dan tidak bisa dipakai lagi. Kode Aktivasi baru dititipkan ke
   * lisensi lama (handover) supaya platform sah beralih otomatis, dan dikirim
   * ke Telegram developer sebagai cadangan. Data pelanggan tidak disentuh (§45).
   */
  async reissue(
    licenseCode: string, paket: Paket, custom: unknown, hari: number | null, jenis: 'STANDARD' | 'TRIAL' | null,
    pelaku: Pelaku, kunciAksi: string | null = null, alasan: string | null = null,
  ): Promise<HasilAksi & { kode_aktivasi?: string }> {
    if (!adalahPaket(paket)) return { ok: false, code: 'INVALID_PACKAGE' };
    const kunci = crypto.randomBytes(32).toString('base64url');
    const h = await rpc<HasilAksi & { old_license_code?: string }>('la_reissue', {
      p_old_code: licenseCode, p_package: paket, p_features: fiturUntuk(paket, custom), p_days: hari,
      p_license_type: jenis, p_key_hash: hashKunciDeployment(kunci), p_actor: pelaku.nama, p_via: pelaku.via,
      p_action_key: kunciAksi, p_reason: alasan,
    });
    if (!h.ok || h.duplicate || !h.license) return h;
    const kode = buatKodeAktivasi({ deploymentId: h.license.deployment_code, licenseId: h.license.license_code, deploymentKey: kunci });
    await rpc('la_set_handover', { p_old_code: licenseCode, p_code: kode });
    await beritahu(h);
    await kirimKeDeveloper(
      `🔑 <b>LISENSI BARU DITERBITKAN</b>\n\n${h.license.company_name}\n${licenseCode} → <code>${h.license.license_code}</code>\n`
      + `Platform pelanggan beralih otomatis. Kode Aktivasi cadangan:\n<code>${kode}</code>`,
    );
    return { ...h, kode_aktivasi: kode };
  },

  /** Upgrade/downgrade ke preset paket = lisensi baru (masa berlaku dibawa). */
  async setPackage(licenseCode: string, paket: Paket, pelaku: Pelaku, kunciAksi: string | null = null, custom?: unknown,
    hari: number | null = null, jenis: 'STANDARD' | 'TRIAL' | null = null): Promise<HasilAksi> {
    return this.reissue(licenseCode, paket, custom, hari, jenis, pelaku, kunciAksi, null);
  },

  /** Ubah satu fitur. Lisensi otomatis menjadi CUSTOM — paket hanyalah preset (§9). */
  async setFeature(licenseCode: string, fitur: string, aktif: boolean, pelaku: Pelaku, kunciAksi: string | null = null): Promise<HasilAksi> {
    if (!adalahKunciFitur(fitur)) return { ok: false, code: 'INVALID_FEATURE' };
    const info = await this.get(licenseCode);
    if (!info) return { ok: false, code: 'LICENSE_NOT_FOUND' };
    const peta = { ...normalisasiFitur(info.features), [fitur]: aktif };
    return this.reissue(info.license_code, 'CUSTOM', peta, null, null, pelaku, kunciAksi, `${fitur}=${aktif ? 'on' : 'off'}`);
  },

  /* ── Pengajuan dari platform yang belum punya lisensi ───────────────── */

  /**
   * HANYA memberi tahu developer lewat Telegram. Tidak ada yang dibuat di
   * database dan tidak ada kode yang dikirim balik — Kode Aktivasi tetap
   * diterbitkan dan diserahkan developer secara manual. Dibatasi 1 pengajuan
   * per platform per 15 menit dan 20 pengajuan per jam secara total.
   */
  async enroll(m: {
    company: string; contact: string; requested_by: string | null; package: Paket; trial: boolean;
    days: number | null; notes: string | null; instance: string; dashboard: string;
  }): Promise<{ ok: boolean; code?: string }> {
    const sejamLalu = new Date(Date.now() - 3600_000).toISOString();
    const { count } = await db().from('processed_actions').select('action_key', { count: 'exact', head: true })
      .like('action_key', 'enroll:%').gte('created_at', sejamLalu);
    if ((count ?? 0) >= 20) return { ok: false, code: 'RATE_LIMITED' };
    const ember = Math.floor(Date.now() / 900_000);
    if (!(await rpc<boolean>('la_claim_once', { p_key: `enroll:${m.instance}:${ember}` }))) {
      return { ok: false, code: 'RATE_LIMITED' };
    }

    const { data: dep } = await db().from('deployments').select('deployment_code, company_name')
      .eq('instance_hash', m.instance).maybeSingle();
    const terdaftar = dep ? `${dep.deployment_code} (${dep.company_name})` : null;

    const q = new URLSearchParams({ company: m.company, paket: m.package, jenis: m.trial ? 'TRIAL' : 'STANDARD' });
    if (!m.trial && m.days) q.set('hari', String(m.days));
    const pesan = teksPengajuanBaru({ ...m, terdaftar });
    // Tombol URL ditolak Telegram bila alamatnya bukan https publik — kirim ulang tanpa tombol.
    const id = await kirimKeDeveloper(pesan, [[{ text: '➕ Buka form registrasi', url: `${m.dashboard}/register?${q}` }]])
      ?? await kirimKeDeveloper(pesan);
    return id === null ? { ok: false, code: 'NOTIFY_FAILED' } : { ok: true };
  },

  /* ── Registrasi (§41) ───────────────────────────────────────────────── */

  async register(m: {
    company: string; environment: 'production' | 'staging' | 'development';
    paket: Paket; hari: number; aktifkan: boolean; custom?: unknown; jenis?: 'STANDARD' | 'TRIAL';
  }, pelaku: Pelaku): Promise<{ ok: boolean; code?: string; deployment_code?: string; license_code?: string; deployment_key?: string; kode_aktivasi?: string }> {
    // Kunci deployment hanya ada di keluaran fungsi ini — pusat menyimpan hash-nya.
    const kunci = crypto.randomBytes(32).toString('base64url');
    const h = await rpc<{ ok: boolean; deployment_code: string; license_code: string }>('la_register_deployment', {
      p_company: m.company, p_environment: m.environment, p_key_hash: hashKunciDeployment(kunci),
      p_package: m.paket, p_features: fiturUntuk(m.paket, m.custom), p_duration_days: m.hari,
      p_activate: m.aktifkan, p_actor: pelaku.nama, p_via: pelaku.via, p_license_type: m.jenis ?? 'STANDARD',
    });
    return {
      ...h,
      deployment_key: h.ok ? kunci : undefined,
      kode_aktivasi: h.ok ? buatKodeAktivasi({ deploymentId: h.deployment_code, licenseId: h.license_code, deploymentKey: kunci }) : undefined,
    };
  },

  /* ── Baca ───────────────────────────────────────────────────────────── */

  /** Cari lisensi dari kode lisensi ATAU kode deployment. */
  async get(kode: string): Promise<InfoLisensi | null> {
    const k = kode.trim().toUpperCase();
    const { data: l } = await db().from('licenses').select('id').eq('license_code', k).maybeSingle();
    let id = l?.id as string | undefined;
    if (!id) {
      const { data: d } = await db().from('deployments').select('id').eq('deployment_code', k).maybeSingle();
      if (d) {
        // Satu deployment bisa punya riwayat lisensi (yang lama DIGANTI) — ambil yang terbaru.
        const { data: l2 } = await db().from('licenses').select('id').eq('deployment_id', d.id)
          .order('created_at', { ascending: false }).limit(1).maybeSingle();
        id = l2?.id;
      }
    }
    if (!id) return null;
    return rpc<InfoLisensi>('la_license_info', { p_license: id });
  },

  async list(): Promise<BarisDaftar[]> {
    const { data: semua } = await db().from('licenses').select('id').order('created_at', { ascending: false }).limit(500);
    const { data: menunggu } = await db().from('license_requests').select('id, license_id').eq('status', 'PENDING_APPROVAL');
    const peta = new Map(((menunggu ?? []) as { id: string; license_id: string }[]).map((r) => [r.license_id, r.id]));
    const hasil: BarisDaftar[] = [];
    for (const r of (semua ?? []) as { id: string }[]) {
      const info = await rpc<InfoLisensi>('la_license_info', { p_license: r.id });
      hasil.push({
        ...info,
        status_efektif: statusEfektif(info.status, info.expires_at, new Date(), info.warning_days),
        jumlah_fitur: KUNCI_FITUR.filter((k) => info.features?.[k]).length,
        pending_request: peta.get(r.id) ?? null,
      });
    }
    return hasil;
  },

  async pendingRequests(): Promise<PermintaanMenunggu[]> {
    const { data } = await db().from('license_requests')
      .select('id, kind, requested_package, requested_features, duration_days, notes, requested_by, requested_at, licenses(license_code), deployments(deployment_code, company_name)')
      .eq('status', 'PENDING_APPROVAL').order('requested_at');
    return (data ?? []) as unknown as PermintaanMenunggu[];
  },

  async auditLog(licenseCode: string): Promise<BarisAudit[]> {
    const { data: l } = await db().from('licenses').select('id').eq('license_code', licenseCode).maybeSingle();
    if (!l) return [];
    const { data } = await db().from('license_audit_logs')
      .select('id, action, previous_state, new_state, performed_by, performed_via, reason, created_at')
      .eq('license_id', l.id).order('created_at', { ascending: false }).limit(100);
    return (data ?? []) as BarisAudit[];
  },

  /** Aktivitas terbaru di semua lisensi (Ringkasan). */
  async auditTerbaru(batas = 12): Promise<BarisAuditTerbaru[]> {
    const { data } = await db().from('license_audit_logs')
      .select('id, action, previous_state, new_state, performed_by, performed_via, reason, created_at, licenses(license_code), deployments(company_name)')
      .order('created_at', { ascending: false }).limit(batas);
    return (data ?? []) as unknown as BarisAuditTerbaru[];
  },

  async requestsFor(licenseCode: string): Promise<RingkasanPermintaan[]> {
    const { data: l } = await db().from('licenses').select('id').eq('license_code', licenseCode).maybeSingle();
    if (!l) return [];
    const { data } = await db().from('license_requests')
      .select('id, kind, requested_package, duration_days, status, reason, notes, requested_at, processed_at')
      .eq('license_id', l.id).order('requested_at', { ascending: false }).limit(20);
    return (data ?? []) as RingkasanPermintaan[];
  },

  /** Peringatan 30/7 hari & kedaluwarsa — tiap tahap sekali (§24). */
  async runExpiryNotices(): Promise<number> {
    const daftar = await rpc<(InfoLisensi & { stage: string })[]>('la_expiry_notices', {});
    for (const l of daftar) await kirimKeDeveloper(teksKedaluwarsa(l));
    return daftar.length;
  },
};
