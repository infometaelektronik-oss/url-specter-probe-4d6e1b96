CREATE OR REPLACE FUNCTION public.proxy_stat(_id uuid, _outcome text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.proxies SET
    success_count = success_count + (CASE WHEN _outcome='success' THEN 1 ELSE 0 END),
    fail_count = fail_count + (CASE WHEN _outcome='fail' THEN 1 ELSE 0 END),
    ban_count = ban_count + (CASE WHEN _outcome='ban' THEN 1 ELSE 0 END),
    last_used_at = now()
  WHERE id = _id;
$$;
REVOKE ALL ON FUNCTION public.proxy_stat(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.proxy_stat(uuid, text) TO service_role;