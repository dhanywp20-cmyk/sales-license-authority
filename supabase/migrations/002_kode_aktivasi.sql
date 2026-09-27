-- ════════════════════════════════════════════════════════════════════════════
-- 002 — Kode Aktivasi: satu kode = satu platform
--
-- Kode Aktivasi diikat ke platform PERTAMA yang memakainya (instance_hash =
-- sidik jari Supabase pelanggan). Platform lain yang memakai kode yang sama
-- ditolak dengan INSTANCE_MISMATCH. Developer bisa melepas ikatan (mis.
-- pelanggan pindah server) lewat dashboard atau Telegram /unbind.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.deployments ADD COLUMN IF NOT EXISTS instance_hash text
  CHECK (instance_hash IS NULL OR instance_hash ~ '^[0-9a-f]{64}$');

DROP FUNCTION IF EXISTS public.la_verify(text, text, text, text);

CREATE OR REPLACE FUNCTION public.la_verify(
  p_deployment text, p_license text, p_key_hash text, p_app_version text, p_instance text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  a record;
  d public.deployments;
BEGIN
  SELECT * INTO a FROM public.la_auth(p_deployment, p_license, p_key_hash);
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'code', 'UNAUTHORIZED'); END IF;

  SELECT * INTO d FROM public.deployments WHERE id = a.deployment_id FOR UPDATE;

  -- Ikatan platform: kode yang sama tidak boleh menghidupkan dua platform.
  IF p_instance IS NOT NULL AND p_instance ~ '^[0-9a-f]{64}$' THEN
    IF d.instance_hash IS NULL THEN
      UPDATE public.deployments SET instance_hash = p_instance WHERE id = d.id;
      PERFORM public.la_audit(a.license_id, 'INSTANCE_BOUND', NULL, jsonb_build_object('instance', left(p_instance, 12)), 'system', 'system', NULL);
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
  UPDATE public.licenses SET last_verified_at = now() WHERE id = a.license_id;

  RETURN jsonb_build_object('ok', true, 'license', public.la_license_info(a.license_id), 'requests', (
    SELECT COALESCE(jsonb_agg(x ORDER BY x.requested_at DESC), '[]'::jsonb) FROM (
      SELECT id, kind, requested_package, duration_days, status, reason, notes, requested_at, processed_at
        FROM public.license_requests WHERE deployment_id = a.deployment_id
       ORDER BY requested_at DESC LIMIT 5) x));
END $$;

CREATE OR REPLACE FUNCTION public.la_reset_instance(p_license_code text, p_actor text, p_via text)
RETURNS jsonb
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE l public.licenses;
BEGIN
  SELECT * INTO l FROM public.licenses WHERE license_code = p_license_code;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'code', 'LICENSE_NOT_FOUND'); END IF;
  UPDATE public.deployments SET instance_hash = NULL, updated_at = now() WHERE id = l.deployment_id;
  PERFORM public.la_audit(l.id, 'INSTANCE_RESET', NULL, NULL, p_actor, p_via, 'Ikatan platform dilepas');
  RETURN jsonb_build_object('ok', true, 'action', 'INSTANCE_RESET', 'license', public.la_license_info(l.id));
END $$;

-- Info lisensi kini menyebut apakah kode sudah terikat ke platform.
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
    'features', public.la_features(l.id))
  FROM public.licenses l JOIN public.deployments d ON d.id = l.deployment_id
  WHERE l.id = p_license;
$$;

DO $$ DECLARE f record; r text; BEGIN
  FOR f IN SELECT p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public' AND p.proname IN ('la_verify', 'la_reset_instance', 'la_license_info') LOOP
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
