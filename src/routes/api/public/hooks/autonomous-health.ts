import { createFileRoute } from "@tanstack/react-router";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "*",
};

export const Route = createFileRoute("/api/public/hooks/autonomous-health")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async () => {
        const { runHealthCheck } = await import("@/lib/scraper/orchestrator.server");
        const s = await runHealthCheck();
        return new Response(JSON.stringify(s), {
          headers: { ...CORS, "Content-Type": "application/json" },
        });
      },
      POST: async () => {
        const { runHealthCheck } = await import("@/lib/scraper/orchestrator.server");
        const s = await runHealthCheck();
        return new Response(JSON.stringify(s), {
          headers: { ...CORS, "Content-Type": "application/json" },
        });
      },
    },
  },
});
