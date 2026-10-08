import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { lovable } from "@/integrations/lovable";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Giriş — Core Stream Engine" },
      { name: "description", content: "Core Stream Engine yönetim konsoluna giriş yap." },
      { property: "og:title", content: "Giriş — Core Stream Engine" },
      { property: "og:description", content: "Core Stream Engine yönetim konsoluna giriş yap." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/console" });
    });
    const { data } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session) navigate({ to: "/console" });
    });
    return () => data.subscription.unsubscribe();
  }, [navigate]);

  const google = async () => {
    setBusy(true);
    const r = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin + "/auth" });
    if (r && "error" in r && r.error) {
      toast.error("Giriş başarısız");
      setBusy(false);
    }
  };

  return (
    <main className="dot-grid flex min-h-screen items-center justify-center px-4">
      <div className="surface w-full max-w-sm rounded-2xl p-8">
        <h1 className="text-2xl font-bold">Konsola giriş</h1>
        <p className="mt-2 text-sm text-muted-foreground">İlk giriş yapan hesap otomatik olarak yönetici olur.</p>
        <button
          onClick={google}
          disabled={busy}
          className="mt-6 w-full rounded-lg bg-primary px-4 py-3 font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "Yönlendiriliyor…" : "Google ile devam et"}
        </button>
      </div>
    </main>
  );
}
