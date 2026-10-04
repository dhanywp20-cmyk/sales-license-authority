import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import ExcelJS from 'exceljs';

/**
 * lib/excel-tema.ts — berkas .xlsx bertema siap cetak (kop, tabel bergaris,
 * zebra, footer halaman), sama gaya dengan ekspor di platform Sales.
 * Dipakai di server (route handler), jadi logo dibaca dari public/.
 */

export interface KolomTema<T> {
  judul: string;
  lebar: number;
  nilai: (b: T) => string | number | null | undefined;
  rata?: 'left' | 'center' | 'right';
  /** Teks monospace (kode). */
  kode?: boolean;
}

const UTAMA = 'FF1D4ED8';
const GELAP = 'FF172E7A';
const MUDA = 'FFF1F5FD';
const SEDANG = 'FFDCE5FB';
const GARIS = 'FFD5DBE3';
const ABU = 'FF64748B';
const HITAM = 'FF1E293B';
const FONT = 'Calibri';

export async function bukuBertema<T>(opsi: {
  judul: string;
  subjudul?: string;
  keterangan: [string, string][];
  kolom: KolomTema<T>[];
  baris: T[];
  catatanKaki?: string;
}): Promise<Buffer> {
  const sekarang = new Date();
  const tgl = sekarang.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' });
  const jam = sekarang.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' });

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Kantor Pusat Lisensi';
  wb.title = opsi.judul;
  wb.created = sekarang;

  const N = opsi.kolom.length + 1;
  const lebar = [5, ...opsi.kolom.map((k) => k.lebar)];
  const ws = wb.addWorksheet(opsi.judul.slice(0, 31), {
    views: [{ showGridLines: false }],
    pageSetup: {
      paperSize: 9, orientation: lebar.reduce((a, b) => a + b, 0) > 105 ? 'landscape' : 'portrait',
      fitToPage: true, fitToWidth: 1, fitToHeight: 0, horizontalCentered: true,
      margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.6, header: 0.2, footer: 0.3 },
    },
    headerFooter: {
      oddFooter: `&L&8&K64748BKantor Pusat Lisensi — ${opsi.judul.replace(/&/g, '&&')}&C&8&K64748BHalaman &P dari &N&R&8&K64748BDicetak ${tgl} ${jam}`,
    },
  });
  ws.columns = lebar.map((width) => ({ width }));
  const gabung = (r: number, a: number, b: number) => { if (b > a) ws.mergeCells(r, a, r, b); };

  // Kop
  let logo: Buffer | null = null;
  try { logo = await readFile(join(process.cwd(), 'public', 'logo.png')); } catch { logo = null; }
  const kk = logo ? Math.min(3, N) : 1;
  const r1 = ws.addRow([]); r1.height = 24;
  const r2 = ws.addRow([]); r2.height = 15;
  const r3 = ws.addRow([]); r3.height = 15;
  r1.getCell(kk).value = 'Kantor Pusat Lisensi';
  r1.getCell(kk).font = { name: FONT, bold: true, size: 16, color: { argb: GELAP } };
  r2.getCell(kk).value = 'Sales Management Platform — License Authority';
  r2.getCell(kk).font = { name: FONT, size: 9, color: { argb: ABU } };
  if (opsi.subjudul) {
    r3.getCell(kk).value = opsi.subjudul;
    r3.getCell(kk).font = { name: FONT, size: 9, bold: true, color: { argb: 'FFB91C1C' } };
  }
  [1, 2, 3].forEach((r) => gabung(r, kk, N));
  if (logo) {
    const id = wb.addImage({ buffer: logo as unknown as ExcelJS.Buffer, extension: 'png' });
    ws.addImage(id, { tl: { col: 0.15, row: 0.1 }, ext: { width: 52, height: 52 } });
  }
  for (let c = 1; c <= N; c++) r3.getCell(c).border = { bottom: { style: 'double', color: { argb: UTAMA } } };
  ws.addRow([]).height = 8;

  const rj = ws.addRow([opsi.judul.toUpperCase()]);
  rj.height = 22;
  rj.getCell(1).font = { name: FONT, bold: true, size: 14, color: { argb: HITAM } };
  rj.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
  gabung(rj.number, 1, N);
  ws.addRow([]).height = 6;

  const info: [string, string][] = [...opsi.keterangan, ['Tanggal cetak', `${tgl}, ${jam} WIB`], ['Jumlah data', `${opsi.baris.length} baris`]];
  info.forEach(([l, v], i) => {
    const r = ws.addRow([]);
    const s = r.getCell(1);
    s.value = { richText: [
      { text: l, font: { name: FONT, size: 9, bold: true, color: { argb: GELAP } } },
      { text: `  :  ${v}`, font: { name: FONT, size: 9, color: { argb: HITAM } } },
    ] };
    s.alignment = { vertical: 'middle', indent: 1 };
    gabung(r.number, 1, N);
    s.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: MUDA } };
    s.border = {
      left: { style: 'medium', color: { argb: UTAMA } },
      top: i === 0 ? { style: 'thin', color: { argb: SEDANG } } : undefined,
      bottom: i === info.length - 1 ? { style: 'thin', color: { argb: SEDANG } } : undefined,
    };
  });
  ws.addRow([]).height = 8;

  const kepala = ws.addRow(['No', ...opsi.kolom.map((k) => k.judul)]);
  kepala.height = 26;
  for (let c = 1; c <= N; c++) {
    const s = kepala.getCell(c);
    s.font = { name: FONT, bold: true, size: 10, color: { argb: 'FFFFFFFF' } };
    s.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: UTAMA } };
    s.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    s.border = { top: { style: 'thin', color: { argb: GELAP } }, bottom: { style: 'medium', color: { argb: GELAP } },
      left: { style: 'thin', color: { argb: 'FFFFFFFF' } }, right: { style: 'thin', color: { argb: 'FFFFFFFF' } } };
  }

  const g = { style: 'thin' as const, color: { argb: GARIS } };
  const border = { top: g, bottom: g, left: g, right: g };
  const zebra = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: MUDA } };
  opsi.baris.forEach((b, idx) => {
    const nilai = opsi.kolom.map((k) => k.nilai(b) ?? '');
    const r = ws.addRow([idx + 1, ...nilai]);
    let tinggi = 1;
    opsi.kolom.forEach((k, i) => {
      const v = nilai[i];
      if (typeof v === 'string') tinggi = Math.max(tinggi, Math.ceil(v.length / Math.max(4, (k.lebar - 1) * (k.kode ? 1.15 : 1.2))));
    });
    if (tinggi > 1) r.height = Math.min(409, 13 * tinggi + 3);
    for (let c = 1; c <= N; c++) {
      const s = r.getCell(c);
      const k = opsi.kolom[c - 2];
      s.font = k?.kode ? { name: 'Consolas', size: 9, color: { argb: HITAM } } : { name: FONT, size: 10, color: { argb: HITAM } };
      s.border = border;
      s.alignment = c === 1 ? { horizontal: 'center', vertical: 'top' }
        : { horizontal: k.rata ?? 'left', vertical: 'top', wrapText: true, indent: 1 };
      if (idx % 2 === 1) s.fill = zebra;
    }
  });
  const hk = kepala.number;
  if (opsi.baris.length) ws.autoFilter = { from: { row: hk, column: 1 }, to: { row: hk + opsi.baris.length, column: N } };

  if (opsi.catatanKaki) {
    ws.addRow([]);
    const r = ws.addRow([opsi.catatanKaki]);
    r.getCell(1).font = { name: FONT, size: 9, italic: true, color: { argb: ABU } };
    gabung(r.number, 1, N);
  }

  ws.views = [{ state: 'frozen', ySplit: hk, xSplit: 0, showGridLines: false }];
  ws.pageSetup.printTitlesRow = `${hk}:${hk}`;
  ws.pageSetup.printArea = `A1:${ws.getColumn(N).letter}${ws.rowCount}`;
  return Buffer.from(await wb.xlsx.writeBuffer());
}
