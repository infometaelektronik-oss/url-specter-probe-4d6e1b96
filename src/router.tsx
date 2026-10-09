import { MutationCache, QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { toast } from "sonner";
import { routeTree } from "./routeTree.gen";

function describe(err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  if (/failed to fetch|network|load failed/i.test(msg)) return "Sunucuya ulaşılamadı. Bağlantını kontrol edip tekrar dene.";
  if (/unauthorized|401/i.test(msg)) return "Oturumun sona erdi, lütfen tekrar giriş yap.";
  return msg || "Beklenmeyen bir hata oluştu.";
}

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: 1 } },
    mutationCache: new MutationCache({
      onError: (err, _v, _c, mutation) => {
        console.error("[console] işlem başarısız:", err);
        if (!mutation.options.onError) toast.error("İşlem başarısız", { description: describe(err) });
      },
    }),
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
