/** Dipasang ulang setiap pindah halaman → isi baru masuk dengan animasi (lihat .animasi-halaman). */
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="animasi-halaman">{children}</div>;
}
