import { getRouterManifest } from "@tanstack/react-start/server";
import { createMemoryHistory, createRouter } from "@tanstack/react-router";
import { renderToString } from "react-dom/server";
import { routeTree } from "./routeTree.gen";
import { QueryClient } from "@tanstack/react-query";

const createRouter$ = () => {
  const queryClient = new QueryClient();
  const memoryHistory = createMemoryHistory({
    initialEntries: ["/"],
  });
  return createRouter({
    routeTree,
    history: memoryHistory,
    context: {
      queryClient,
    },
  });
};

export const handler = async (request: Request) => {
  const router = createRouter$();
  const html = renderToString(<router.App />);
  return new Response(html, {
    headers: {
      "Content-Type": "text/html",
    },
  });
};