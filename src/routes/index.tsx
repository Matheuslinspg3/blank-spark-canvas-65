import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Mail } from "lucide-react";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Disparo Tracker — Envio de e-mails em massa" },
      {
        name: "description",
        content:
          "Crie disparos de e-mail em massa a partir de um CSV, salve rascunhos e acompanhe o log de entrega de cada job.",
      },
      { property: "og:title", content: "Disparo Tracker — Envio de e-mails em massa" },
      {
        property: "og:description",
        content:
          "Upload de CSV, template HTML personalizado, rascunhos salvos e relatório de envio exportável.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  const navigate = useNavigate();

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) void navigate({ to: "/disparos", replace: true });
    });
  }, [navigate]);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col items-center justify-center gap-6 px-4 text-center">
      <h1 className="flex items-center gap-2 text-3xl font-semibold tracking-tight">
        <Mail className="text-primary size-8" />
        Disparo Tracker
      </h1>
      <p className="text-muted-foreground">
        Cada disparo criado vira um job: enquanto não for enviado, fica salvo como rascunho na sua
        conta.
      </p>
      <Button asChild size="lg">
        <Link to="/auth">Entrar para começar</Link>
      </Button>
    </main>
  );
}
