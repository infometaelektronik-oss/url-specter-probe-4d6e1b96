import { createFileRoute } from "@tanstack/react-router";

const run = async ({ request }: { request: Request }) => {
  const { verifyCron, json, loggedRun } = await import("@/lib/api/cron.server");
  if (!(await verifyCron(request))) return json({ error: "unauthorized" }, 401);
  const { runHealthCheck } = await import("@/lib/scraper/orchestrator.server"); return loggedRun("sağlık taraması", () => runHealthCheck());
};

export const Route = createFileRoute("/api/public/hooks/engine-health")({
  server: { handlers: { GET: run, POST: run } },
});
