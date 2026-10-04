'use client';

import { useActionState, useState } from 'react';
import { kirim } from '@/app/kirim-form';
import { aksiMasuk } from './aksi';

function Kirim({ pending }: { pending: boolean }) {
  return <button className="primary lebar tombol-masuk" disabled={pending}>{pending ? 'Memeriksa…' : 'Masuk'}</button>;
}

export function FormMasuk({ ke, pakai2fa }: { ke: string; pakai2fa: boolean }) {
  const [hasil, aksi, pending] = useActionState(aksiMasuk, {});
  const [lihat, setLihat] = useState(false);
  return (
    <form onSubmit={kirim(aksi)} className="form-masuk" data-tanpa-progres>
      <input type="hidden" name="ke" value={ke} />
      <label>
        <span className="label-masuk">Username</span>
        <input name="username" type="text" required autoFocus autoComplete="username" autoCapitalize="none"
          autoCorrect="off" spellCheck={false} placeholder="developer" />
      </label>
      <label>
        <span className="label-masuk">Kata sandi</span>
        <span className="sandi">
          <input name="sandi" type={lihat ? 'text' : 'password'} required autoComplete="current-password" placeholder="••••••••" />
          <button type="button" className="lihat" onClick={() => setLihat((v) => !v)} aria-label={lihat ? 'Sembunyikan sandi' : 'Tampilkan sandi'}>
            {lihat ? '🙈' : '👁'}
          </button>
        </span>
      </label>
      {pakai2fa && (
        <label>
          <span className="label-masuk">Kode authenticator</span>
          <input name="kode" type="text" required inputMode="numeric" autoComplete="one-time-code"
            pattern="[0-9 ]{6,7}" maxLength={7} placeholder="123456" className="kode-2fa" />
        </label>
      )}
      {hasil.galat && <p className="galat" role="alert">{hasil.galat}</p>}
      <Kirim pending={pending} />
    </form>
  );
}
