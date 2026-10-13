import { createFileRoute } from "@tanstack/react-router";

const run = async ({ request }: { request: Request }) => {
  const { verifyCron, json, loggedRun } = await import("@/lib/api/cron.server");
  if (!(await verifyCron(request))) return json({ error: "unauthorized" }, 401);
  const { syncEpg } = await import("@/lib/scraper/epg.server"); return loggedRun("EPG senkronu", () => syncEpg());
};

export const Route = createFileRoute("/api/public/hooks/engine-epg")({
  server: { handlers: { GET: run, POST: run } },
});
