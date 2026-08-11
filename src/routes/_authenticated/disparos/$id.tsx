import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";

import { BulkEmailDashboard } from "@/components/bulk-email/BulkEmailDashboard";
import { SimpleDispatch } from "@/components/bulk-email/SimpleDispatch";
import { getCampaign } from "@/lib/campaigns.functions";

export const Route = createFileRoute("/_authenticated/disparos/$id")({
  component: CampaignPage,
});

function CampaignPage() {
  const { id } = Route.useParams();
  const fetchCampaign = useServerFn(getCampaign);

  const { data, isLoading, error } = useQuery({
    queryKey: ["campaign", id],
    queryFn: () => fetchCampaign({ data: { id } }),
  });

  if (isLoading) {
    return <p className="text-muted-foreground p-10 text-sm">Carregando disparo…</p>;
  }
  if (error || !data) {
    return <p className="text-destructive p-10 text-sm">Não foi possível carregar este disparo.</p>;
  }

  if (data.mode === "simples") return <SimpleDispatch campaign={data} />;
  return <BulkEmailDashboard campaign={data} />;
}
