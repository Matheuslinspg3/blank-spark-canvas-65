import { createFileRoute } from "@tanstack/react-router";

import { BulkEmailDashboard } from "@/components/bulk-email/BulkEmailDashboard";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Disparo Tracker — Envio de e-mails em massa" },
      {
        name: "description",
        content:
          "Carregue um CSV, personalize o template HTML com variáveis e dispare campanhas de e-mail em massa com log de entrega.",
      },
      { property: "og:title", content: "Disparo Tracker — Envio de e-mails em massa" },
      {
        property: "og:description",
        content:
          "Upload de CSV, template HTML personalizado, preview por destinatário e relatório de envio exportável.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  return <BulkEmailDashboard />;
}
