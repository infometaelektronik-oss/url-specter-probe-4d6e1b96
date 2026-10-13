import { createFileRoute } from "@tanstack/react-router";

const run = async ({ request }: { request: Request }) => {
  const { verifyCron, json, loggedRun } = await import("@/lib/api/cron.server");
  if (!(await verifyCron(request))) return json({ error: "unauthorized" }, 401);
  const { runDiscovery } = await import("@/lib/scraper/orchestrator.server"); return loggedRun("keşif", async () => { const { logs: _l, ...r } = await runDiscovery(); return r; });
};

export const Route = createFileRoute("/api/public/hooks/engine-discover")({
  server: { handlers: { GET: run, POST: run } },
});
