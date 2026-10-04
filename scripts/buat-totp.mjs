// Membuat rahasia 2FA untuk login Developer Kantor Pusat.
//   npm run totp
// 1. Pindai QR yang tampil dengan Google Authenticator / Authy.
// 2. Salin nilai CENTRAL_ADMIN_TOTP_SECRET ke Vercel → Settings → Environment
//    Variables (Production), lalu Redeploy.
// Rahasia ini TIDAK disimpan di mana pun oleh skrip — jangan di-commit.
import crypto from 'node:crypto';
import QRCode from 'qrcode';

const ABJAD = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
let bit = 0, nilai = 0, rahasia = '';
for (const b of crypto.randomBytes(20)) {
  nilai = (nilai << 8) | b; bit += 8;
  while (bit >= 5) { rahasia += ABJAD[(nilai >>> (bit - 5)) & 31]; bit -= 5; }
}
const akun = process.env.CENTRAL_ADMIN_USERNAME || 'developer';
const uri = `otpauth://totp/Kantor%20Pusat:${encodeURIComponent(akun)}?secret=${rahasia}&issuer=Kantor%20Pusat&algorithm=SHA1&digits=6&period=30`;

console.log(await QRCode.toString(uri, { type: 'terminal', small: true }));
console.log('Kunci manual (bila tidak bisa memindai):', rahasia.match(/.{1,4}/g).join(' '));
console.log('\nIsi di Vercel (Production) lalu Redeploy:\n');
console.log(`CENTRAL_ADMIN_TOTP_SECRET=${rahasia}\n`);
