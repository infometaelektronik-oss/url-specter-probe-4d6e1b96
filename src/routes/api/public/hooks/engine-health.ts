import { createFileRoute } from "@tanstack/react-router";

const run = async ({ request }: { request: Request }) => {
  const { verifyCron, json } = await import("@/lib/api/cron.server");
  if (!(await verifyCron(request))) return json({ error: "unauthorized" }, 401);
  const { runHealthCheck } = await import("@/lib/scraper/orchestrator.server"); return json(await runHealthCheck());
};

export const Route = createFileRoute("/api/public/hooks/engine-health")({
  server: { handlers: { GET: run, POST: run } },
});
