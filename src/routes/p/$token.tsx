import { createFileRoute } from "@tanstack/react-router";

import { BridgeCard } from "@/components/bridge/BridgeCard";
import { getBridgePageFn, submitBridgeLeadFn } from "@/lib/bridge.functions";

export const Route = createFileRoute("/p/$token")({
  shouldReload: false,
  loader: ({ params }) =>
    /^[A-Za-z0-9]{24,64}$/.test(params.token)
      ? getBridgePageFn({ data: { token: params.token } })
      : null,
  head: ({ loaderData }) => ({
    meta: [
      { title: loaderData?.title ?? "Página indisponível" },
      { name: "description", content: loaderData?.subtitle || "Deixe seus dados para contato." },
      { property: "og:title", content: loaderData?.title ?? "Página indisponível" },
      {
        property: "og:description",
        content: loaderData?.subtitle || "Deixe seus dados para contato.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  errorComponent: Unavailable,
  notFoundComponent: Unavailable,
  component: BridgePage,
});

function Unavailable() {
  return (
    <main className="bg-muted/40 flex min-h-screen items-center justify-center p-4">
      <p className="text-muted-foreground text-sm">Este link não está mais disponível.</p>
    </main>
  );
}

function BridgePage() {
  const config = Route.useLoaderData();
  const { token } = Route.useParams();
  if (!config) return <Unavailable />;

  return (
    <main className="from-muted/60 via-background to-muted/40 flex min-h-screen items-center justify-center bg-gradient-to-br px-4 py-10">
      <BridgeCard
        config={config}
        onSubmit={async (values) => {
          try {
            const result = await submitBridgeLeadFn({ data: { token, ...values } });
            if (!result.ok) return result.error;
            window.location.href = result.redirectUrl;
            return null;
          } catch {
            return "Não foi possível enviar agora. Tente novamente.";
          }
        }}
      />
    </main>
  );
}
