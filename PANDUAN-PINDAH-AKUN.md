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

## 5. Daftarkan pelanggan & sambungkan aplikasi Sales
1. Dashboard Kantor Pusat baru → **Registrasi deployment** → catat 5 baris `LICENSE_...`.
2. Di Vercel **pelanggan** (proyek aplikasi Sales) → Environment Variables → isi/ganti:
   `LICENSE_AUTHORITY_URL`, `LICENSE_DEPLOYMENT_ID`, `LICENSE_ID`, `LICENSE_DEPLOYMENT_KEY`, `LICENSE_PUBLIC_KEY`.
3. Redeploy aplikasi Sales → Admin → Lisensi → **Periksa sekarang**.

## Catatan pemeliharaan
- `lib/kontrak/kontrak.ts` dan `lib/kontrak/tanda-tangan.ts` adalah salinan **identik** dari
  `lib/lisensi/` di repo aplikasi Sales. Bila daftar fitur/paket diubah, ubah di **kedua** repo.
- Jangan pernah menaruh `LICENSE_PRIVATE_KEY`, `TELEGRAM_BOT_TOKEN`, atau `CENTRAL_ADMIN_SECRET`
  di repo, di chat, atau di akun pelanggan.
- Uji database: `supabase/tests/authority.sql` (22 uji, diakhiri ROLLBACK).
