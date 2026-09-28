/** Tampil SEKETIKA saat pindah menu, selama server menyiapkan halaman — tidak terlihat macet. */
export default function Memuat() {
  return (
    <div aria-busy="true" aria-label="Memuat halaman">
      <div className="kepala-halaman">
        <div style={{ flex: 1 }}>
          <div className="kerangka" style={{ width: 220, height: 26 }} />
          <div className="kerangka" style={{ width: 360, maxWidth: '80%', height: 12, marginTop: 10 }} />
        </div>
      </div>
      <div className="statistik">
        {[0, 1, 2, 3].map((i) => <div key={i} className="kerangka" style={{ height: 86, borderRadius: '1rem' }} />)}
      </div>
      <div className="card">
        <div className="kerangka" style={{ width: 180, height: 12, marginBottom: 18 }} />
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="kerangka" style={{ height: 16, marginBottom: 14, width: `${92 - i * 8}%` }} />
        ))}
      </div>
    </div>
  );
}
