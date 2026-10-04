# Panduan: Kantor Pusat Lisensi di akun terpisah

Kantor Pusat (License Authority) adalah milik **developer**, bukan milik pelanggan.
Karena itu ia tinggal di akun GitHub, Vercel, dan Supabase **Anda sendiri** yang
terpisah dari akun aplikasi Sales pelanggan.

| Layanan | Akun | Isi |
|---|---|---|
| GitHub | akun developer (Gmail baru) | repo **privat** `sales-license-authority` (isi ZIP ini) |
| Vercel | login dengan GitHub developer | proyek `sales-license-authority` |
| Supabase | akun developer (Gmail baru) | proyek `sales-license-authority` |
| Telegram | bot @SMPlatformDeveloper_bot (tetap) | webhook diarahkan ke Vercel developer |

---

## 1. GitHub — repo privat
1. Masuk GitHub dengan akun developer → **New repository**.
2. Nama: `sales-license-authority` · pilih **Private** · **jangan** centang README → **Create repository**.
3. Di halaman repo kosong klik **uploading an existing file**.
4. Ekstrak ZIP ini di komputer, buka foldernya, **pilih semua isinya** (bukan foldernya) lalu seret ke halaman GitHub.
   Pastikan folder `app`, `lib`, `scripts`, `supabase` dan berkas `package.json` ikut.
5. **Commit changes**.

## 2. Supabase — database pusat
1. Masuk Supabase dengan akun developer → **New project** → nama `sales-license-authority`, region **Singapore**.
2. **SQL Editor → New query** → buka berkas `supabase/migrations/001_license_authority.sql` dari ZIP,
   salin seluruh isinya, tempel, **Run** → harus "Success".
3. **Project Settings → API**: catat **Project URL** dan **service_role key** (Reveal).

## 3. Vercel — web Kantor Pusat
1. Buka vercel.com → **Sign up / Log in with GitHub** memakai akun GitHub developer.
2. **Add New → Project** → pilih repo `sales-license-authority` → **Import**.
   (Root Directory biarkan kosong — semua berkas ada di akar repo.)
3. Buka **Environment Variables**, isi:

| Key | Value |
|---|---|
| `SUPABASE_URL` | Project URL (langkah 2) |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role key (langkah 2) |
| `TELEGRAM_BOT_TOKEN` | token bot dari @BotFather |
| `TELEGRAM_DEVELOPER_ID` | angka Id Anda dari @userinfobot |
| `LICENSE_PRIVATE_KEY` | dari Claude (kunci baru) |
| `TELEGRAM_WEBHOOK_SECRET` | dari Claude |
| `CENTRAL_ADMIN_SECRET` | dari Claude — kata sandi dashboard |
| `CRON_SECRET` | dari Claude |

4. **Deploy**. Setelah Ready: **Settings → Deployment Protection → Vercel Authentication**
   → pilih **Only Preview Deployments** (alamat produksi harus bisa dihubungi bot & aplikasi pelanggan;
   dashboard tetap terkunci kata sandi sendiri) → **Save**.

## 4. Telegram — arahkan ke alamat baru
Buka di browser (ganti bagian `<...>`):
```
https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://<alamat-vercel-baru>/api/telegram/webhook&secret_token=<TELEGRAM_WEBHOOK_SECRET>&allowed_updates=%5B%22message%22%2C%22callback_query%22%5D
```
Lalu kirim `/help` ke bot → harus membalas.

## 5. Pembaruan database (sekali)
Supabase developer → **SQL Editor** → jalankan berurutan, masing-masing sampai "Success":
1. `supabase/migrations/002_kode_aktivasi.sql`
2. `supabase/migrations/003_trial_dan_ganti_lisensi.sql`
3. `supabase/migrations/004_simpan_kode_aktivasi.sql`

Cek: buka `https://<kantor-pusat>/cek` → baris "SQL 002", "SQL 003", dan "SQL 004" harus hijau.

## 6. Daftarkan pelanggan — cukup satu Kode Aktivasi
1. Dashboard Kantor Pusat → **Registrasi deployment** → pilih paket → **Registrasi**.
2. Salin **Kode Aktivasi** (diawali `SMPA1-`) dan berikan ke Admin pelanggan.
3. Admin pelanggan: aplikasi Sales → **Admin Panel → Lisensi** → tempel kode → **Aktifkan**.
   Tidak perlu mengisi Environment Variables lisensi di Vercel pelanggan.
4. Kode terikat ke platform pertama yang memakainya. Pelanggan pindah server?
   Dashboard → buka lisensinya → **Lepas ikatan platform** (atau Telegram `/unbind KODE`).

## 7. Lisensi TRIAL (jumlah hari bebas)
- Registrasi → **Jenis lisensi: Trial** → isi **Durasi** berapa hari saja (mis. 7, 14, 30) → centang
  Registrasi (lisensi langsung aktif) → berikan Kode Aktivasi ke pelanggan.
- Satu platform hanya boleh punya satu pendaftaran: pelanggan yang sama **tidak bisa** memakai
  kode trial baru untuk mengulang trial (ditolak "Platform ini sudah terdaftar dengan lisensi lain").

## 8. Upgrade / ganti paket / trial → penuh = LISENSI BARU
- Dashboard → buka lisensi → **Paket & fitur** → pilih paket (dan jenis/durasi bila perlu) →
  **Terbitkan lisensi baru**. Atau Telegram: tombol paket / **⭐ Trial → Penuh**.
- Pusat menerbitkan lisensi **baru** (kode baru). Lisensi lama menjadi **DIGANTI** dan tidak bisa
  dipakai lagi di mana pun.
- Platform pelanggan **beralih otomatis** pada pemeriksaan berikutnya (≤ 24 jam, atau Admin pelanggan
  klik *Periksa sekarang*). Kode Aktivasi baru juga dikirim ke Telegram developer sebagai cadangan.
- Perpanjang masa berlaku (+30/+90/+1 tahun) TIDAK menerbitkan lisensi baru.

## Catatan pemeliharaan
- `lib/kontrak/kontrak.ts` dan `lib/kontrak/tanda-tangan.ts` adalah salinan **identik** dari
  `lib/lisensi/` di repo aplikasi Sales. Bila daftar fitur/paket diubah, ubah di **kedua** repo.
- Jangan pernah menaruh `LICENSE_PRIVATE_KEY`, `TELEGRAM_BOT_TOKEN`, atau `CENTRAL_ADMIN_SECRET`
  di repo, di chat, atau di akun pelanggan.
- Uji database: `supabase/tests/authority.sql` (22 uji, diakhiri ROLLBACK).

## 9. Pengajuan dari platform yang belum punya kode
- Admin pelanggan: Admin Panel → Lisensi → **Belum punya Kode Aktivasi? Ajukan lisensi** → isi → Kirim.
- Pengajuan hanya muncul di **Telegram developer** ("📝 PENGAJUAN LISENSI BARU"). Tidak ada kode yang
  dikirim otomatis.
- Bila disetujui: tekan **➕ Buka form registrasi** (isian sudah terisi) → Registrasi → kirim Kode
  Aktivasi ke kontak pelanggan secara manual.
- Dibatasi 1 pengajuan per platform per 15 menit, 20 per jam total. Tidak perlu SQL baru.

## 10. Tampilan baru dashboard (login, sidebar, Keluar)

⚠ **Cara unggah versi ini (penting):** halaman lama dipindah ke folder `app/(dasbor)/`. Di repo GitHub
Kantor Pusat, **hapus dulu** berkas/folder lama berikut, baru unggah isi ZIP (`app`, `lib`, `middleware.ts`,
`PANDUAN-PINDAH-AKUN.md`). Kalau tidak dihapus, build Vercel gagal ("two parallel pages resolve to /"):
`app/page.tsx`, `app/register/`, `app/cek/`, `app/l/`.
Cara paling aman: hapus seluruh folder `app` di GitHub, lalu unggah folder `app` baru dari ZIP.

- Buka alamat Kantor Pusat → halaman **Masuk** → isi kata sandi = nilai `CENTRAL_ADMIN_SECRET`
  (tidak ada lagi kotak sandi bawaan browser). Sesi berlaku 12 jam.
- Tombol **Keluar** ada di kiri bawah (di ponsel: kanan atas).
- Menu: **Ringkasan** (angka & yang perlu tindakan), **Lisensi**, **Permintaan**, **Registrasi**, **Pemeriksaan**.
- Durasi memakai pilihan yang sama dengan aplikasi Sales: 1 / 3 / 6 Bulan, 1 / 2 Tahun.
  Trial: 7 / 14 / 30 hari, atau **Lainnya** untuk jumlah hari bebas.
- Keamanan: 10 kali salah sandi dalam 15 menit → login dikunci 15 menit. Mengganti
  `CENTRAL_ADMIN_SECRET` di Vercel otomatis mengeluarkan semua sesi.
- Tidak perlu SQL baru.

## 11. Tidak ada persetujuan kedua
- Registrasi di Kantor Pusat kini **selalu langsung aktif**: menerbitkan Kode Aktivasi = persetujuan Anda.
  Pelanggan menempel kode → modul langsung terbuka, tanpa mengajukan permintaan lagi.
- Lisensi lama yang terlanjur **Menunggu aktivasi**: buka lisensinya → **✅ Aktifkan sekarang** (atau
  Telegram `/info KODE` → tombol **✅ AKTIFKAN**). Platform pelanggan ikut aktif ≤ 5 menit.

## 12. Lisensi dicabut → lisensi baru
- Lisensi yang **dicabut** bersifat final (tidak bisa diperpanjang). Admin pelanggan otomatis melihat form
  **Ajukan lisensi baru** (Trial/Berlangganan) → masuk Telegram Anda → Registrasi → kirim kode baru.
- Kode baru boleh dipakai di platform yang sama: ikatan platform lama dilepas otomatis **hanya bila**
  lisensi lamanya dicabut. Lisensi yang masih aktif/berakhir tetap mengunci platform (trial tidak bisa diulang).

## 13. Kode Aktivasi bisa dilihat lagi & diekspor
- Jalankan **sekali** `supabase/migrations/004_simpan_kode_aktivasi.sql` di SQL Editor Supabase Kantor Pusat.
- Setiap kode baru (registrasi / ganti paket / buat ulang) disimpan **terenkripsi** dan bisa dilihat lagi:
  buka lisensinya → bagian **Kode Aktivasi** → **Tampilkan** / **Salin kode**. Salinan juga dikirim ke Telegram.
- **Ekspor semua kode**: menu Lisensi → **⬇ Ekspor kode (CSV)** (buka dengan Excel). Simpan di tempat aman.
- Kode yang dibuat **sebelum** SQL 004 tidak pernah tersimpan. Bila belum dipakai platform: **🔄 Buat ulang kode**
  (kode lama tidak berlaku). Bila sudah dipakai: **Lepas ikatan platform** → **Buat ulang kode** → tempel kode baru di platform.
- Kunci enkripsinya diturunkan dari `LICENSE_PRIVATE_KEY` — jangan ganti variabel itu, atau kode tersimpan tidak bisa dibuka.

## 14. Login dengan username + animasi pindah halaman
- Halaman Masuk kini dua kolom (seperti aplikasi Sales) dengan **Username** + **Kata sandi**.
- Username = env `CENTRAL_ADMIN_USERNAME` di Vercel Kantor Pusat (tidak peka huruf besar/kecil).
  Bila tidak diisi, username bawaan: **`developer`**. Kata sandi tetap `CENTRAL_ADMIN_SECRET`.
  Setelah menambah/mengubah env di Vercel → Deployments → **Redeploy**.
- Pindah menu kini menampilkan bilah progres di atas, kerangka halaman (skeleton) saat memuat,
  dan animasi masuk halaman.

## 15. Next.js 15.5 (keamanan) — tidak perlu langkah tambahan

Kode sudah memakai Next.js 15.5 + React 19 (`npm audit`: 0 celah). Cukup push
seperti biasa; Vercel memasang ulang dependensi sendiri. Isian form login &
registrasi kini tidak hilang lagi saat ada kesalahan.

## 16. Verifikasi dua langkah (2FA) untuk login Developer — sangat dianjurkan

1. Di laptop, dalam folder repo ini: `npm install` lalu `npm run totp`.
2. Pindai QR yang tampil dengan Google Authenticator / Authy.
3. Vercel → Settings → Environment Variables → tambah
   `CENTRAL_ADMIN_TOTP_SECRET` = nilai yang dicetak → **Redeploy**.
4. Login berikutnya meminta **Kode authenticator** 6 digit (kode yang sama
   tidak bisa dipakai dua kali). `/cek` menampilkan baris 2FA hijau.

Setiap login berhasil dicatat (IP + perangkat) di **Ringkasan → Login Developer
terakhir** dan dikirim ke Telegram Anda. Ada login yang bukan Anda? Ganti
`CENTRAL_ADMIN_SECRET` di Vercel lalu Redeploy — semua sesi langsung keluar.

Kehilangan HP: hapus `CENTRAL_ADMIN_TOTP_SECRET` di Vercel → Redeploy (login
kembali sandi saja), lalu ulangi langkah 1–3.

## 17. Cadangan data otomatis

- **Setiap Senin** Kantor Pusat mengirim berkas `cadangan-kantor-pusat-*.smpbak`
  ke Telegram Developer (deployment, lisensi, fitur, permintaan, audit).
- Kapan saja: **Pemeriksaan (`/cek`) → Unduh cadangan sekarang**.
- Berkasnya terenkripsi dengan `LICENSE_PRIVATE_KEY` — tanpa kunci itu tidak
  bisa dibuka. Simpan `LICENSE_PRIVATE_KEY` di tempat aman terpisah.
- Memulihkan (mis. ke project Supabase baru setelah SQL 001–004):
  ```
  LICENSE_PRIVATE_KEY="<sama dengan di Vercel>" node scripts/pulihkan-cadangan.mjs cadangan-kantor-pusat-2026-10-05.smpbak
  ```
  lalu jalankan berkas `.sql` hasilnya di SQL Editor (aman diulang).
- Uji kirim sekarang (opsional): buka
  `https://<domain-kantor-pusat>/api/cron?cadangan=1` dengan header
  `Authorization: Bearer <CRON_SECRET>`.

## 18. CI GitHub

`.github/workflows/ci.yml` menjalankan typecheck + build di setiap push.
Lihat hasilnya di tab **Actions** repo GitHub Kantor Pusat.
