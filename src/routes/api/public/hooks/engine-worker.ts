import { createFileRoute } from "@tanstack/react-router";

const run = async ({ request }: { request: Request }) => {
  const { verifyCron, json } = await import("@/lib/api/cron.server");
  if (!(await verifyCron(request))) return json({ error: "unauthorized" }, 401);
  const { runWorker } = await import("@/lib/scraper/orchestrator.server"); return json(await runWorker({ batch: 12 }));
};

export const Route = createFileRoute("/api/public/hooks/engine-worker")({
  server: { handlers: { GET: run, POST: run } },
});
