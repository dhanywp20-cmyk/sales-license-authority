/** Label berbahasa Indonesia untuk kode status/aksi — satu sumber untuk semua halaman dashboard. */

export const LABEL_STATUS: Record<string, string> = {
  ACTIVE: 'Aktif', PENDING: 'Menunggu aktivasi', EXPIRING_SOON: 'Segera berakhir', EXPIRED: 'Berakhir',
  SUSPENDED: 'Ditangguhkan', REVOKED: 'Dicabut', REPLACED: 'Diganti',
};

export const LABEL_JENIS_PERMINTAAN: Record<string, string> = {
  NEW: 'Lisensi baru', EXTENSION: 'Perpanjangan', CHANGE_PACKAGE: 'Ganti paket',
};

export const LABEL_STATUS_PERMINTAAN: Record<string, string> = {
  DRAFT: 'Draf', PENDING_APPROVAL: 'Menunggu', APPROVED: 'Disetujui', REJECTED: 'Ditolak', CANCELLED: 'Dibatalkan',
};

export const LABEL_AKSI: Record<string, string> = {
  CREATED: 'Lisensi dibuat', APPROVED: 'Disetujui', REJECTED: 'Ditolak', EXTENDED: 'Diperpanjang',
  UPGRADED: 'Upgrade', DOWNGRADED: 'Downgrade', CHANGED: 'Diubah', SUSPENDED: 'Ditangguhkan',
  REACTIVATED: 'Diaktifkan kembali', REVOKED: 'Dicabut', REPLACED: 'Diganti lisensi baru', EXPIRED: 'Berakhir',
  INSTANCE_BOUND: 'Kode dipakai platform', INSTANCE_RESET: 'Ikatan platform dilepas',
  REQUESTED: 'Permintaan masuk', REQUEST_APPROVED: 'Permintaan disetujui', REQUEST_CANCELLED: 'Permintaan dibatalkan',
};

export const LABEL_LEWAT: Record<string, string> = {
  telegram: 'Telegram', web: 'Dashboard', api: 'Platform pelanggan', system: 'Sistem',
};

export function label(peta: Record<string, string>, kode: string | null | undefined): string {
  return kode ? peta[kode] ?? kode : '—';
}
