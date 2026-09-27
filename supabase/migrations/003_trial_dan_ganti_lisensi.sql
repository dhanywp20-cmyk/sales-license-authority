-- ════════════════════════════════════════════════════════════════════════════
-- 003 — Lisensi TRIAL & "satu lisensi tidak dipakai berulang"
--
-- 1. Setiap lisensi punya kunci sendiri (licenses.key_hash). Kode Aktivasi
--    = deployment + lisensi + kunci lisensi itu.
-- 2. Ganti paket / upgrade / trial → penuh = TERBITKAN LISENSI BARU
--    (la_reissue): kode baru, kunci baru. Lisensi lama berstatus REPLACED
--    (final — tidak bisa diaktifkan, diperpanjang, atau diubah lagi).
--    Platform yang sah menerima kode penggantinya lewat respons verifikasi
--    bertanda tangan (handover), lalu beralih otomatis.
-- 3. Satu platform = satu deployment: sidik jari platform yang sudah terikat
--    ke deployment lain ditolak (PLATFORM_TAKEN) — trial tidak bisa diulang
--    dengan mendaftarkan deployment baru di platform yang sama.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.licenses DROP CONSTRAINT IF EXISTS licenses_deployment_id_key;
CREATE INDEX IF NOT EXISTS licenses_deployment ON public.licenses (deployment_id);

ALTER TABLE public.licenses ADD COLUMN IF NOT EXISTS key_hash text
  CHECK (key_hash IS NULL OR key_hash ~ '^[0-9a-f]{64}$');
ALTER TABLE public.licenses ADD COLUMN IF NOT EXISTS replaces_license_id uuid REFERENCES public.licenses(id);
ALTER TABLE public.licenses ADD COLUMN IF NOT EXISTS replaced_by uuid REFERENCES public.licenses(id);
-- Kode Aktivasi pengganti, hanya sampai lisensi baru pertama kali terverifikasi.
ALTER TABLE public.licenses ADD COLUMN IF NOT EXISTS handover_code text;

UPDATE public.licenses l SET key_hash = d.key_hash
  FROM public.deployments d WHERE d.id = l.deployment_id AND l.key_hash IS NULL;

ALTER TABLE public.licenses DROP CONSTRAINT IF EXISTS licenses_status_check;
ALTER TABLE public.licenses ADD CONSTRAINT licenses_status_check
  CHECK (status IN ('PENDING', 'ACTIVE', 'SUSPENDED', 'REVOKED', 'REPLACED'));

CREATE UNIQUE INDEX IF NOT EXISTS deployments_instance_unik
  ON public.deployments (instance_hash) WHERE instance_hash IS NOT NULL;

-- ── Autentikasi memakai kunci LISENSI ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.la_auth(p_deployment text, p_license text, p_key_hash text)
RETURNS TABLE (deployment_id uuid, license_id uuid)
LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  SELECT d.id, l.id
    FROM public.deployments d JOIN public.licenses l ON l.deployment_id = d.id
   WHERE d.deployment_code = p_deployment AND l.license_code = p_license AND l.key_hash = p_key_hash;
$$;

CREATE OR REPLACE FUNCTION public.la_license_info(p_license uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  SELECT jsonb_build_object(
    'license_code', l.license_code, 'deployment_code', d.deployment_code, 'company_name', d.company_name,
    'package', l.package, 'status', l.status, 'license_type', l.license_type,
    'issued_at', l.issued_at, 'starts_at', l.starts_at, 'expires_at', l.expires_at,
    'grace_period_days', l.grace_period_days, 'warning_days', l.warning_days,
    'min_version', l.min_version, 'max_version', l.max_version,
    'last_verified_at', l.last_verified_at, 'application_version', d.application_version,
    'instance_bound', d.instance_hash IS NOT NULL,
    'replaced_by_code', (SELECT n.license_code FROM public.licenses n WHERE n.id = l.replaced_by),
    'replaces_code', (SELECT o.license_code FROM public.licenses o WHERE o.id = l.replaces_license_id),
    'features', public.la_features(l.id))
  FROM public.licenses l JOIN public.deployments d ON d.id = l.deployment_id
  WHERE l.id = p_license;
$$;

-- ── Verifikasi: ikatan platform, satu platform satu deployment, handover ───
CREATE OR REPLACE FUNCTION public.la_verify(
  p_deployment text, p_license text, p_key_hash text, p_app_version text, p_instance text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  a record;
  d public.deployments;
  l public.licenses;
BEGIN
  SELECT * INTO a FROM public.la_auth(p_deployment, p_license, p_key_hash);
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'code', 'UNAUTHORIZED'); END IF;

  SELECT * INTO d FROM public.deployments WHERE id = a.deployment_id FOR UPDATE;
  SELECT * INTO l FROM public.licenses WHERE id = a.license_id FOR UPDATE;

  IF p_instance IS NOT NULL AND p_instance ~ '^[0-9a-f]{64}$' THEN
    IF d.instance_hash IS NULL THEN
      -- Platform ini sudah milik deployment lain → tolak (mencegah trial berulang).
      IF EXISTS (SELECT 1 FROM public.deployments x WHERE x.instance_hash = p_instance AND x.id <> d.id) THEN
        RETURN jsonb_build_object('ok', false, 'code', 'PLATFORM_TAKEN');
      END IF;
      UPDATE public.deployments SET instance_hash = p_instance WHERE id = d.id;
      PERFORM public.la_audit(l.id, 'INSTANCE_BOUND', NULL, jsonb_build_object('instance', left(p_instance, 12)), 'system', 'system', NULL);
    ELSIF d.instance_hash <> p_instance THEN
      RETURN jsonb_build_object('ok', false, 'code', 'INSTANCE_MISMATCH');
    END IF;
  END IF;

  IF d.rl_window IS NULL OR d.rl_window < now() - interval '1 minute' THEN
    UPDATE public.deployments SET rl_window = now(), rl_count = 1 WHERE id = d.id;
  ELSIF d.rl_count >= 30 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'RATE_LIMITED');
  ELSE
    UPDATE public.deployments SET rl_count = rl_count + 1 WHERE id = d.id;
  END IF;

  UPDATE public.deployments
     SET last_seen_at = now(), application_version = left(p_app_version, 40), updated_at = now()
   WHERE id = d.id;
  UPDATE public.licenses SET last_verified_at = now() WHERE id = l.id;

  -- Lisensi pengganti dipakai untuk pertama kali: kode serah-terima dihapus.
  IF l.replaces_license_id IS NOT NULL THEN
    UPDATE public.licenses SET handover_code = NULL WHERE id = l.replaces_license_id AND handover_code IS NOT NULL;
  END IF;

  RETURN jsonb_build_object('ok', true, 'license', public.la_license_info(l.id),
    -- Hanya untuk lisensi yang SUDAH diganti: kode penggantinya, agar platform sah beralih otomatis.
    'handover_code', CASE WHEN l.status = 'REPLACED' THEN l.handover_code END,
    'requests', (
      SELECT COALESCE(jsonb_agg(x ORDER BY x.requested_at DESC), '[]'::jsonb) FROM (
        SELECT id, kind, requested_package, duration_days, status, reason, notes, requested_at, processed_at
          FROM public.license_requests WHERE deployment_id = a.deployment_id
         ORDER BY requested_at DESC LIMIT 5) x));
END $$;

-- ── Registrasi: jenis lisensi (STANDARD/TRIAL) + kunci per lisensi ─────────
DROP FUNCTION IF EXISTS public.la_register_deployment(text, text, text, text, jsonb, integer, boolean, text, text);

CREATE OR REPLACE FUNCTION public.la_register_deployment(
  p_company text, p_environment text, p_key_hash text, p_package text, p_features jsonb,
  p_duration_days integer, p_activate boolean, p_actor text, p_via text, p_license_type text DEFAULT 'STANDARD'
) RETURNS jsonb
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  v_seq bigint := nextval('public.la_deployment_seq');
  v_tahun text := to_char(now(), 'YYYY');
  v_singkat text;
  v_dep uuid;
  v_lic uuid;
  v_dep_code text;
  v_lic_code text;
BEGIN
  IF p_license_type NOT IN ('STANDARD', 'TRIAL') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_TYPE');
  END IF;
  v_singkat := left(regexp_replace(upper(regexp_replace(p_company, '^\s*(PT|CV|UD|TBK)\.?\s+', '', 'i')), '[^A-Z0-9]', '', 'g'), 3);
  IF length(v_singkat) < 2 THEN v_singkat := 'CUS'; END IF;
  v_dep_code := format('SMA-%s-%s-%s', v_singkat, v_tahun, lpad(v_seq::text, 3, '0'));
  v_lic_code := format('LIC-SMA-%s-%s', v_tahun, lpad(v_seq::text, 4, '0'));

  INSERT INTO public.deployments (deployment_code, company_name, environment, key_hash)
  VALUES (v_dep_code, trim(p_company), COALESCE(p_environment, 'production'), p_key_hash)
  RETURNING id INTO v_dep;

  INSERT INTO public.licenses (license_code, deployment_id, package, license_type, status, key_hash,
                               issued_at, starts_at, expires_at)
  VALUES (v_lic_code, v_dep, p_package, p_license_type,
    CASE WHEN p_activate THEN 'ACTIVE' ELSE 'PENDING' END, p_key_hash,
    CASE WHEN p_activate THEN now() END,
    CASE WHEN p_activate THEN now() END,
    CASE WHEN p_activate THEN now() + make_interval(days => COALESCE(p_duration_days, 365)) END)
  RETURNING id INTO v_lic;

  PERFORM public.la_set_features(v_lic, p_features);
  PERFORM public.la_audit(v_lic, 'CREATED', NULL, public.la_snapshot(v_lic) || jsonb_build_object('license_type', p_license_type), p_actor, p_via, NULL);

  RETURN jsonb_build_object('ok', true, 'deployment_code', v_dep_code, 'license_code', v_lic_code,
    'license', public.la_license_info(v_lic));
END $$;

-- ── Terbitkan lisensi pengganti ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.la_reissue(
  p_old_code text, p_package text, p_features jsonb, p_days integer, p_license_type text,
  p_key_hash text, p_actor text, p_via text, p_action_key text, p_reason text
) RETURNS jsonb
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  v_dup jsonb := public.la_claim(p_action_key);
  o public.licenses;
  v_new uuid;
  v_code text;
  v_action text;
  v_old int; v_newc int;
BEGIN
  IF v_dup IS NOT NULL THEN RETURN v_dup; END IF;

  SELECT * INTO o FROM public.licenses WHERE license_code = p_old_code FOR UPDATE;
  IF NOT FOUND THEN RETURN public.la_finish(p_action_key, jsonb_build_object('ok', false, 'code', 'LICENSE_NOT_FOUND')); END IF;
  IF o.status IN ('REVOKED', 'REPLACED') THEN
    RETURN public.la_finish(p_action_key, jsonb_build_object('ok', false, 'code', 'LICENSE_' || o.status));
  END IF;
  IF p_days IS NOT NULL AND (p_days < 1 OR p_days > 3660) THEN
    RETURN public.la_finish(p_action_key, jsonb_build_object('ok', false, 'code', 'INVALID_DURATION'));
  END IF;

  v_code := format('LIC-SMA-%s-%s', to_char(now(), 'YYYY'), lpad(nextval('public.la_deployment_seq')::text, 4, '0'));

  INSERT INTO public.licenses (license_code, deployment_id, package, license_type, status, key_hash,
                               issued_at, starts_at, expires_at, grace_period_days, warning_days,
                               replaces_license_id)
  VALUES (v_code, o.deployment_id, p_package, COALESCE(p_license_type, o.license_type),
    CASE WHEN o.status = 'SUSPENDED' THEN 'SUSPENDED' ELSE 'ACTIVE' END, p_key_hash,
    now(), now(),
    -- Tanpa durasi baru: masa berlaku lisensi lama dibawa (upgrade di tengah periode).
    CASE WHEN p_days IS NOT NULL THEN now() + make_interval(days => p_days)
         ELSE COALESCE(GREATEST(o.expires_at, now()), now() + interval '365 days') END,
    o.grace_period_days, o.warning_days, o.id)
  RETURNING id INTO v_new;
  PERFORM public.la_set_features(v_new, p_features);

  UPDATE public.licenses SET status = 'REPLACED', replaced_by = v_new, updated_at = now() WHERE id = o.id;
  UPDATE public.license_requests SET status = 'CANCELLED', processed_at = now(), processed_by = p_actor,
         reason = 'Lisensi diganti'
   WHERE license_id = o.id AND status = 'PENDING_APPROVAL';

  SELECT count(*) FILTER (WHERE enabled) INTO v_old FROM public.license_features WHERE license_id = o.id;
  SELECT count(*) FILTER (WHERE enabled) INTO v_newc FROM public.license_features WHERE license_id = v_new;
  v_action := CASE WHEN v_newc > v_old THEN 'UPGRADED' WHEN v_newc < v_old THEN 'DOWNGRADED' ELSE 'CHANGED' END;

  PERFORM public.la_audit(o.id, 'REPLACED', public.la_snapshot(o.id), jsonb_build_object('replaced_by', v_code), p_actor, p_via, p_reason);
  PERFORM public.la_audit(v_new, v_action, jsonb_build_object('replaces', o.license_code),
    public.la_snapshot(v_new) || jsonb_build_object('license_type', COALESCE(p_license_type, o.license_type)), p_actor, p_via, p_reason);

  RETURN public.la_finish(p_action_key, jsonb_build_object(
    'ok', true, 'action', v_action, 'old_license_code', o.license_code, 'license', public.la_license_info(v_new)));
END $$;

/** Simpan Kode Aktivasi pengganti (dibuat di server app karena butuh kunci asli). */
CREATE OR REPLACE FUNCTION public.la_set_handover(p_old_code text, p_code text) RETURNS void
LANGUAGE sql SET search_path = public, pg_temp AS $$
  UPDATE public.licenses SET handover_code = p_code WHERE license_code = p_old_code AND status = 'REPLACED';
$$;

/** Tandai permintaan disetujui setelah dipenuhi dengan lisensi pengganti. */
CREATE OR REPLACE FUNCTION public.la_mark_request(p_request uuid, p_actor text, p_via text) RETURNS void
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE r public.license_requests;
BEGIN
  SELECT * INTO r FROM public.license_requests WHERE id = p_request FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  UPDATE public.license_requests SET status = 'APPROVED', processed_at = now(), processed_by = p_actor
   WHERE id = p_request;
  PERFORM public.la_audit(r.license_id, 'REQUEST_APPROVED', NULL, jsonb_build_object('request_id', r.id, 'kind', r.kind), p_actor, p_via, NULL);
END $$;

-- ── Lisensi yang sudah DIGANTI bersifat final ──────────────────────────────
CREATE OR REPLACE FUNCTION public.la_tolak_diganti() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'REPLACED' AND (NEW.status <> 'REPLACED' OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
      OR NEW.package IS DISTINCT FROM OLD.package) THEN
    RAISE EXCEPTION 'LICENSE_REPLACED: lisensi yang sudah diganti tidak bisa dipakai atau diubah lagi.';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS licenses_diganti_final ON public.licenses;
CREATE TRIGGER licenses_diganti_final BEFORE UPDATE ON public.licenses
  FOR EACH ROW EXECUTE FUNCTION public.la_tolak_diganti();

DO $$ DECLARE f record; r text; BEGIN
  FOR f IN SELECT p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public' AND p.proname LIKE 'la\_%' LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', f.sig);
    FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
        EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM %I', f.sig, r);
      END IF;
    END LOOP;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f.sig);
    END IF;
  END LOOP;
END $$;
