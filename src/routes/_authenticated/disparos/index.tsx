import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Bot, FilePlus2, LayoutTemplate, LogOut, Mail, Settings2, Trash2, Users, Zap } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { STATUS_LABEL, type CampaignStatus } from "@/lib/campaigns";
import { createCampaign, deleteCampaign, listCampaigns } from "@/lib/campaigns.functions";

export const Route = createFileRoute("/_authenticated/disparos/")({
  component: CampaignsPage,
});

function statusVariant(status: CampaignStatus) {
  if (status === "concluido") return "default" as const;
  if (status === "erro") return "destructive" as const;
  return "secondary" as const;
}

function CampaignsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fetchList = useServerFn(listCampaigns);
  const create = useServerFn(createCampaign);
  const remove = useServerFn(deleteCampaign);

  const { data: campaigns = [], isLoading } = useQuery({
    queryKey: ["campaigns"],
    queryFn: () => fetchList(),
  });

  const createMutation = useMutation({
    mutationFn: (mode: "completo" | "simples" | "molde" | "ia") => create({ data: { mode } }),
    onSuccess: (campaign) => {
      void queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      void navigate({ to: "/disparos/$id", params: { id: campaign.id } });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => {
      toast.success("Disparo removido");
      void queryClient.invalidateQueries({ queryKey: ["campaigns"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    void navigate({ to: "/auth", replace: true });
  }

  return (
    <main className="mx-auto w-full max-w-[1000px] space-y-6 px-4 py-10">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Mail className="text-primary size-6" />
            Meus disparos
          </h1>
          <p className="text-muted-foreground text-sm">
            Cada disparo criado vira um job. Enquanto não for enviado, fica como rascunho.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link to="/contatos">
              <Users className="size-4" />
              Contatos e IA
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild>

            <Link to="/configuracoes">
              <Settings2 className="size-4" />
              Configurar IA
            </Link>
          </Button>
          <Button variant="ghost" size="sm" onClick={() => void signOut()}>
            <LogOut className="size-4" />
            Sair
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={createMutation.isPending}
            onClick={() => createMutation.mutate("ia")}
          >
            <Bot className="size-4" />
            Disparo por IA (chat)
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={createMutation.isPending}
            onClick={() => createMutation.mutate("simples")}
          >
            <Zap className="size-4" />
            Disparo simples
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={createMutation.isPending}
            onClick={() => createMutation.mutate("molde")}
          >
            <LayoutTemplate className="size-4" />
            Disparo com molde
          </Button>
          <Button
            size="sm"
            disabled={createMutation.isPending}
            onClick={() => createMutation.mutate("completo")}
          >
            <FilePlus2 className="size-4" />
            Disparo completo
          </Button>
        </div>
      </header>

      {isLoading && <p className="text-muted-foreground text-sm">Carregando…</p>}

      {!isLoading && campaigns.length === 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Nenhum disparo ainda</CardTitle>
            <CardDescription>
              Crie um novo disparo para começar — ele é salvo automaticamente como rascunho.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {scheduled.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarClock className="text-primary size-4" />
              Disparos programados ({scheduled.length})
            </CardTitle>
            <CardDescription>
              O robô do servidor envia sozinho na janela de horário escolhida, mesmo com o site
              fechado.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {scheduled.map((campaign) => {
              const schedule = campaign.schedule;
              const pending = Math.max(0, (campaign.total_count ?? 0) - (campaign.sent_count ?? 0));
              return (
                <div
                  key={campaign.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
                >
                  <div className="min-w-0 space-y-1">
                    <Link
                      to="/disparos/$id"
                      params={{ id: campaign.id }}
                      className="font-medium hover:underline"
                    >
                      {campaign.name}
                    </Link>
                    <p className="text-muted-foreground text-xs">
                      {campaign.sent_count}/{campaign.total_count} enviados · {pending} na fila
                      {schedule?.enabled
                        ? ` · das ${schedule.startTime} às ${schedule.endTime}, 1 a cada ${schedule.intervalSeconds}s`
                        : " · envio contínuo"}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      Próximo envio:{" "}
                      {campaign.next_send_at
                        ? new Date(campaign.next_send_at).toLocaleString("pt-BR")
                        : "assim que a janela abrir"}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={cancelMutation.isPending}
                    onClick={() => cancelMutation.mutate(campaign.id)}
                  >
                    <XCircle className="size-4" />
                    Cancelar
                  </Button>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3">
        {campaigns.map((campaign) => (
          <Card key={campaign.id}>
            <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
              <div className="min-w-0 space-y-1">
                <Link
                  to="/disparos/$id"
                  params={{ id: campaign.id }}
                  className="font-medium hover:underline"
                >
                  {campaign.name}
                </Link>
                <p className="text-muted-foreground text-xs">
                  {campaign.total_count} destinatários · {campaign.sent_count} enviados ·{" "}
                  {new Date(campaign.created_at).toLocaleString("pt-BR")}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {campaign.mode === "ia" && <Badge variant="outline">IA</Badge>}
                {campaign.mode === "simples" && <Badge variant="outline">Simples</Badge>}
                {campaign.mode === "molde" && <Badge variant="outline">Molde</Badge>}
                <Badge variant={statusVariant(campaign.status)}>
                  {STATUS_LABEL[campaign.status]}
                </Badge>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Excluir disparo"
                  onClick={() => deleteMutation.mutate(campaign.id)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </main>
  );
}
