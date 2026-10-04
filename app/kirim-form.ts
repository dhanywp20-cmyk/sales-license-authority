import { startTransition, type FormEvent } from 'react';

// Dikirim lewat onSubmit + startTransition, bukan <form action>: React 19
// mengosongkan form setelah action selesai, sehingga isian hilang setiap kali
// server menolak (sandi salah, validasi gagal).
export function kirim(aksi: (fd: FormData) => void) {
  return (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(() => aksi(fd));
  };
}
