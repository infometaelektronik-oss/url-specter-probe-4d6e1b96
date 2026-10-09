# Architecture rules

- Scraping engine lives in `src/lib/scraper/*.server.ts`; all outbound requests go through `smartFetch` (identity + proxy rotation, block detection, captcha escalation) so telemetry and bans are tracked in one place.
- Proxies are URL-template gateways (`{url}`, `{country}`) stored in the `proxies` table, because the worker runtime cannot open raw proxy sockets.
- Work is distributed via the `crawl_jobs` table claimed with `claim_jobs` (SKIP LOCKED); each invocation is one worker capped at 6 concurrent outbound requests.
- External IPTV consumers use `/api/public/v1/*` with hashed API keys, IP whitelist and per-minute limits (`api_hit`); responses are cached in `feed_cache` instead of Redis.
- Scheduled endpoints under `/api/public/hooks/engine-*` require the `cron_token` from `engine_settings`.
- The admin console is `/console` under `_authenticated`; all its server functions require the `admin` role from `user_roles` (first signed-in user claims it).
