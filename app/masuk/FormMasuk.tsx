'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { aksiMasuk } from './aksi';

function Kirim() {
  const { pending } = useFormStatus();
  return <button className="primary lebar" disabled={pending}>{pending ? 'Memeriksa…' : 'Masuk'}</button>;
}

export function FormMasuk({ ke }: { ke: string }) {
  const [hasil, aksi] = useFormState(aksiMasuk, {});
  return (
    <form action={aksi} className="form-masuk">
      <input type="hidden" name="ke" value={ke} />
      <label>
        Kata sandi
        <input name="sandi" type="password" required autoFocus autoComplete="current-password" />
      </label>
      {hasil.galat && <p className="galat" role="alert">{hasil.galat}</p>}
      <Kirim />
      <p className="muted">Kata sandi = nilai <code>CENTRAL_ADMIN_SECRET</code> di Vercel Kantor Pusat.</p>
    </form>
  );
}
