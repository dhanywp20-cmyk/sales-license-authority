import { adalahPaket } from '@/lib/kontrak/kontrak.ts';
import { FormRegistrasi } from './FormRegistrasi';

export const dynamic = 'force-dynamic';

export default function HalamanRegistrasi({ searchParams }: {
  searchParams: { company?: string; paket?: string; jenis?: string; hari?: string };
}) {
  // Isian awal dari tombol "Buka form registrasi" pada pengajuan Telegram.
  const hari = Number(searchParams.hari);
  const awal = {
    company: (searchParams.company ?? '').slice(0, 160),
    paket: adalahPaket(searchParams.paket) ? searchParams.paket : undefined,
    jenis: searchParams.jenis === 'TRIAL' ? 'TRIAL' as const : 'STANDARD' as const,
    hari: Number.isInteger(hari) && hari >= 1 && hari <= 3660 ? hari : searchParams.jenis === 'TRIAL' ? 14 : 365,
  };
  return (
    <>
      <h1>Registrasi deployment</h1>
      <p className="muted">
        Satu pelanggan = satu deployment (Vercel + Supabase sendiri) = satu lisensi. Registrasi menerbitkan
        Deployment ID, License ID, dan kunci deployment. Tidak ada perubahan kode sumber per pelanggan.
      </p>
      <FormRegistrasi awal={awal} />
    </>
  );
}
