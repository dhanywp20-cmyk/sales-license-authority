'use client';

import { useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { aksiMasuk } from './aksi';

function Kirim() {
  const { pending } = useFormStatus();
  return <button className="primary lebar tombol-masuk" disabled={pending}>{pending ? 'Memeriksa…' : 'Masuk'}</button>;
}

export function FormMasuk({ ke }: { ke: string }) {
  const [hasil, aksi] = useFormState(aksiMasuk, {});
  const [lihat, setLihat] = useState(false);
  return (
    <form action={aksi} className="form-masuk" data-tanpa-progres>
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
      {hasil.galat && <p className="galat" role="alert">{hasil.galat}</p>}
      <Kirim />
    </form>
  );
}
