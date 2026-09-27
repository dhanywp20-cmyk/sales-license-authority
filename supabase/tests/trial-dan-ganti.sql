-- ════════════════════════════════════════════════════════════════════════════
-- Uji migrasi 002–003: trial, kode sekali-pakai per platform, lisensi pengganti.
-- Jalankan sebagai pemilik DB (diakhiri ROLLBACK). `nyata` harus = `harapan`.
-- ════════════════════════════════════════════════════════════════════════════
BEGIN;
CREATE TEMP TABLE hasil(no int, uji text, harapan text, nyata text) ON COMMIT DROP;
CREATE TEMP TABLE ctx(k text PRIMARY KEY, v text) ON COMMIT DROP;
CREATE TEMP TABLE kunci(k text PRIMARY KEY, h text) ON COMMIT DROP;
INSERT INTO kunci VALUES ('a', encode(digest('kunci-a','sha256'),'hex')), ('b', encode(digest('kunci-b','sha256'),'hex')),
  ('c', encode(digest('kunci-c','sha256'),'hex'));

-- Trial 14 hari, langsung aktif.
WITH r AS (SELECT public.la_register_deployment('PT Coba Trial','production',(SELECT h FROM kunci WHERE k='a'),
  'PROFESSIONAL','{"pipeline":true}',14,true,'uji','web','TRIAL') AS j)
INSERT INTO ctx SELECT 'dep', j->>'deployment_code' FROM r UNION ALL SELECT 'lic', j->>'license_code' FROM r;

INSERT INTO hasil SELECT 1,'Lisensi TRIAL dengan durasi pilihan (14 hari)','TRIAL 14',
  license_type||' '||round(extract(epoch FROM expires_at-issued_at)/86400)::text
  FROM licenses WHERE license_code=(SELECT v FROM ctx WHERE k='lic');

-- Platform A memakai kode trial.
INSERT INTO hasil SELECT 2,'Platform A memakai kode','true',
  public.la_verify((SELECT v FROM ctx WHERE k='dep'),(SELECT v FROM ctx WHERE k='lic'),(SELECT h FROM kunci WHERE k='a'),'1',repeat('a',64))->>'ok';
INSERT INTO hasil SELECT 3,'Kode yang sama di platform B ditolak','INSTANCE_MISMATCH',
  public.la_verify((SELECT v FROM ctx WHERE k='dep'),(SELECT v FROM ctx WHERE k='lic'),(SELECT h FROM kunci WHERE k='a'),'1',repeat('b',64))->>'code';

-- Trial kedua (deployment baru) di platform A yang sama → ditolak.
WITH r AS (SELECT public.la_register_deployment('PT Coba Trial Lagi','production',(SELECT h FROM kunci WHERE k='b'),
  'PROFESSIONAL','{}',14,true,'uji','web','TRIAL') AS j)
INSERT INTO ctx SELECT 'dep2', j->>'deployment_code' FROM r UNION ALL SELECT 'lic2', j->>'license_code' FROM r;
INSERT INTO hasil SELECT 4,'Trial baru di platform yang sama ditolak','PLATFORM_TAKEN',
  public.la_verify((SELECT v FROM ctx WHERE k='dep2'),(SELECT v FROM ctx WHERE k='lic2'),(SELECT h FROM kunci WHERE k='b'),'1',repeat('a',64))->>'code';

-- Upgrade trial → Business 365 hari = lisensi BARU.
WITH r AS (SELECT public.la_reissue((SELECT v FROM ctx WHERE k='lic'),'BUSINESS','{"pipeline":true,"gp_calculation":true}',365,'STANDARD',
  (SELECT h FROM kunci WHERE k='c'),'dev','telegram','tg:x1',NULL) AS j)
INSERT INTO ctx SELECT 'lic_baru', j->'license'->>'license_code' FROM r;
INSERT INTO hasil SELECT 5,'Upgrade menerbitkan kode lisensi baru','berbeda',
  CASE WHEN (SELECT v FROM ctx WHERE k='lic_baru') <> (SELECT v FROM ctx WHERE k='lic') THEN 'berbeda' ELSE 'sama' END;
INSERT INTO hasil SELECT 6,'Lisensi lama berstatus REPLACED','REPLACED', status FROM licenses WHERE license_code=(SELECT v FROM ctx WHERE k='lic');
INSERT INTO hasil SELECT 7,'Lisensi baru STANDARD BUSINESS aktif','STANDARD BUSINESS ACTIVE',
  license_type||' '||package||' '||status FROM licenses WHERE license_code=(SELECT v FROM ctx WHERE k='lic_baru');

SELECT public.la_set_handover((SELECT v FROM ctx WHERE k='lic'), 'SMPA1-uji');
INSERT INTO hasil SELECT 8,'Platform A (kode lama) menerima kode pengganti','REPLACED SMPA1-uji',
  (x->'license'->>'status')||' '||(x->>'handover_code')
  FROM (SELECT public.la_verify((SELECT v FROM ctx WHERE k='dep'),(SELECT v FROM ctx WHERE k='lic'),(SELECT h FROM kunci WHERE k='a'),'1',repeat('a',64)) x) s;

INSERT INTO hasil SELECT 9,'Kode baru jalan di platform A','true',
  public.la_verify((SELECT v FROM ctx WHERE k='dep'),(SELECT v FROM ctx WHERE k='lic_baru'),(SELECT h FROM kunci WHERE k='c'),'1',repeat('a',64))->>'ok';
INSERT INTO hasil SELECT 10,'Kode serah-terima dihapus setelah dipakai','kosong',
  COALESCE(handover_code,'kosong') FROM licenses WHERE license_code=(SELECT v FROM ctx WHERE k='lic');
INSERT INTO hasil SELECT 11,'Kode baru tetap tidak jalan di platform B','INSTANCE_MISMATCH',
  public.la_verify((SELECT v FROM ctx WHERE k='dep'),(SELECT v FROM ctx WHERE k='lic_baru'),(SELECT h FROM kunci WHERE k='c'),'1',repeat('b',64))->>'code';

-- Lisensi lama final.
INSERT INTO hasil SELECT 12,'Lisensi lama tidak bisa diganti lagi','LICENSE_REPLACED',
  public.la_reissue((SELECT v FROM ctx WHERE k='lic'),'ENTERPRISE','{}',30,NULL,(SELECT h FROM kunci WHERE k='b'),'dev','web',NULL,NULL)->>'code';
DO $x$ BEGIN
  BEGIN
    UPDATE licenses SET status='ACTIVE' WHERE license_code=(SELECT v FROM ctx WHERE k='lic');
    INSERT INTO hasil VALUES (13,'Lisensi lama tidak bisa dihidupkan kembali','ditolak','DITERIMA');
  EXCEPTION WHEN raise_exception THEN
    INSERT INTO hasil VALUES (13,'Lisensi lama tidak bisa dihidupkan kembali','ditolak','ditolak');
  END;
END $x$;
INSERT INTO hasil SELECT 14,'Ketukan ganda tombol upgrade tidak menerbitkan 2 lisensi','true',
  public.la_reissue((SELECT v FROM ctx WHERE k='lic'),'BUSINESS','{}',365,'STANDARD',(SELECT h FROM kunci WHERE k='c'),'dev','telegram','tg:x1',NULL)->>'duplicate';

SELECT no, uji, harapan, nyata, (harapan = nyata) AS lulus FROM hasil ORDER BY no;
ROLLBACK;
