'use client';

import { useState } from 'react';

/** Kode Aktivasi tersembunyi sampai diminta; bisa disalin sekali klik. */
export function KodeTersimpan({ kode }: { kode: string }) {
  const [tampil, setTampil] = useState(false);
  const [tersalin, setTersalin] = useState(false);
  return (
    <div>
      <pre className="secret" style={{ fontSize: 13 }}>{tampil ? kode : `${kode.slice(0, 10)}${'•'.repeat(24)}`}</pre>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" onClick={() => setTampil((t) => !t)}>{tampil ? '🙈 Sembunyikan' : '👁 Tampilkan'}</button>
        <button type="button" className="primary" onClick={async () => {
          await navigator.clipboard.writeText(kode);
          setTersalin(true);
          setTimeout(() => setTersalin(false), 2000);
        }}>{tersalin ? '✓ Tersalin' : '📋 Salin kode'}</button>
      </div>
    </div>
  );
}
