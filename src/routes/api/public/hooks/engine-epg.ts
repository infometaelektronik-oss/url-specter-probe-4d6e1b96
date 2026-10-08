import { createFileRoute } from "@tanstack/react-router";

const run = async ({ request }: { request: Request }) => {
  const { verifyCron, json } = await import("@/lib/api/cron.server");
  if (!(await verifyCron(request))) return json({ error: "unauthorized" }, 401);
  const { syncEpg } = await import("@/lib/scraper/epg.server"); return json(await syncEpg());
};

export const Route = createFileRoute("/api/public/hooks/engine-epg")({
  server: { handlers: { GET: run, POST: run } },
});
