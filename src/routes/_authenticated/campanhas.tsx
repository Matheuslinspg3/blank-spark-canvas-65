import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  ChevronDown,
  Link2,
  Loader2,
  MousePointerClick,
  Plus,
  Save,
  Target,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import type { CampaignLink, MarketingCampaignWithStats } from "@/lib/marketing-campaigns";
import {
  createMarketingCampaignFn,
  deleteMarketingCampaignFn,
  listMarketingCampaignClicksFn,
  listMarketingCampaignsFn,
  updateMarketingCampaignFn,
} from "@/lib/marketing-campaigns.functions";

export const Route = createFileRoute("/_authenticated/campanhas")({
  head: () => ({
    meta: [
      { title: "Campanhas — Disparo Tracker" },
      {
        name: "description",
        content: "Crie campanhas com objetivo, público e links e acompanhe os cliques de cada uma.",
      },
      { property: "og:title", content: "Campanhas — Disparo Tracker" },
      {
        property: "og:description",
        content: "Crie campanhas com objetivo, público e links e acompanhe os cliques de cada uma.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CampanhasPage,
});

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function CampanhasPage() {
  const queryClient = useQueryClient();
  const [openId, setOpenId] = useState<string | null>(null);

  const { data: campaigns = [], isLoading } = useQuery({
    queryKey: ["marketing-campaigns"],
    queryFn: () => listMarketingCampaignsFn(),
    refetchInterval: 60_000,
  });

  const createMutation = useMutation({
    mutationFn: () => createMarketingCampaignFn({ data: {} }),
    onSuccess: (campaign) => {
      setOpenId(campaign.id);
      void queryClient.invalidateQueries({ queryKey: ["marketing-campaigns"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteMarketingCampaignFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Campanha removida");
      void queryClient.invalidateQueries({ queryKey: ["marketing-campaigns"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <main className="mx-auto w-full max-w-[1000px] space-y-6 px-4 py-10">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/disparos">
              <ArrowLeft className="size-4" />
              Meus disparos
            </Link>
          </Button>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Target className="text-primary size-6" />
            Campanhas
          </h1>
          <p className="text-muted-foreground text-sm">
            Cada campanha guarda o objetivo, o público e os links da ação. Ao vincular um disparo à
            campanha, todo clique dos e-mails enviados aparece aqui, com o destinatário.
          </p>
        </div>
        <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
          {createMutation.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Plus className="size-4" />
          )}
          Nova campanha
        </Button>
      </header>

      {isLoading && <p className="text-muted-foreground text-sm">Carregando…</p>}

      {!isLoading && campaigns.length === 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Nenhuma campanha ainda</CardTitle>
            <CardDescription>
              Crie a primeira campanha para descrever o objetivo, o público e os links que serão
              usados nos disparos.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      <div className="grid gap-3">
        {campaigns.map((campaign) => (
          <CampaignCard
            key={campaign.id}
            campaign={campaign}
            open={openId === campaign.id}
            onToggle={() => setOpenId(openId === campaign.id ? null : campaign.id)}
            onDelete={() => deleteMutation.mutate(campaign.id)}
          />
        ))}
      </div>
    </main>
  );
}

function CampaignCard({
  campaign,
  open,
  onToggle,
  onDelete,
}: {
  campaign: MarketingCampaignWithStats;
  open: boolean;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(campaign.name);
  const [objective, setObjective] = useState(campaign.objective);
  const [audience, setAudience] = useState(campaign.audience);
  const [links, setLinks] = useState<CampaignLink[]>(campaign.links);

  const { data: clicks = [] } = useQuery({
    queryKey: ["marketing-campaign-clicks", campaign.id],
    queryFn: () => listMarketingCampaignClicksFn({ data: { id: campaign.id } }),
    enabled: open,
    refetchInterval: open ? 30_000 : false,
  });

  const saveMutation = useMutation({
    mutationFn: () =>
      updateMarketingCampaignFn({
        data: {
          id: campaign.id,
          patch: {
            name: name.trim() || "Campanha sem nome",
            objective,
            audience,
            links: links.filter((link) => link.url.trim().length > 0),
          },
        },
      }),
    onSuccess: () => {
      toast.success("Campanha salva");
      void queryClient.invalidateQueries({ queryKey: ["marketing-campaigns"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <CardTitle className="text-base">{campaign.name}</CardTitle>
          <CardDescription>
            {campaign.stats.dispatches} disparos · {campaign.stats.trackedLinks} links rastreados ·{" "}
            {campaign.stats.clickedRecipients} pessoas clicaram · {campaign.stats.totalClicks}{" "}
            cliques
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onToggle}>
            <ChevronDown className={`size-4 transition-transform ${open ? "rotate-180" : ""}`} />
            {open ? "Fechar" : "Abrir"}
          </Button>
          <Button variant="ghost" size="icon" aria-label="Remover campanha" onClick={onDelete}>
            <Trash2 className="size-4" />
          </Button>
        </div>
      </CardHeader>

      {open && (
        <CardContent className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor={`name-${campaign.id}`}>Nome da campanha</Label>
              <Input
                id={`name-${campaign.id}`}
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`objective-${campaign.id}`}>Objetivo</Label>
              <Textarea
                id={`objective-${campaign.id}`}
                rows={4}
                placeholder="Ex.: agendar reuniões com construtoras sobre a cota de aprendizes."
                value={objective}
                onChange={(event) => setObjective(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`audience-${campaign.id}`}>Público</Label>
              <Textarea
                id={`audience-${campaign.id}`}
                rows={4}
                placeholder="Ex.: RH de construtoras e postos da Baixada Santista."
                value={audience}
                onChange={(event) => setAudience(event.target.value)}
              />
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-2">
                <Link2 className="size-4" />
                Links da campanha
              </Label>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setLinks([...links, { label: "", url: "" }])}
              >
                <Plus className="size-4" />
                Adicionar link
              </Button>
            </div>
            {links.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                Nenhum link ainda. Adicione os endereços usados nos e-mails desta campanha.
              </p>
            ) : (
              links.map((link, index) => (
                <div key={index} className="grid gap-2 sm:grid-cols-[1fr_2fr_auto]">
                  <Input
                    placeholder="Nome (ex.: WhatsApp)"
                    value={link.label}
                    onChange={(event) => {
                      const next = [...links];
                      next[index] = { ...link, label: event.target.value };
                      setLinks(next);
                    }}
                  />
                  <Input
                    placeholder="https://…"
                    value={link.url}
                    onChange={(event) => {
                      const next = [...links];
                      next[index] = { ...link, url: event.target.value };
                      setLinks(next);
                    }}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Remover link"
                    onClick={() => setLinks(links.filter((_, i) => i !== index))}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))
            )}
          </div>

          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
            {saveMutation.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Save className="size-4" />
            )}
            Salvar campanha
          </Button>

          <div className="space-y-3">
            <Label className="flex items-center gap-2">
              <MousePointerClick className="size-4" />
              Cliques desta campanha
            </Label>
            {clicks.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                Ainda não houve cliques nesta campanha.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Destinatário</TableHead>
                    <TableHead>Destino</TableHead>
                    <TableHead>Disparo</TableHead>
                    <TableHead className="text-right">Cliques</TableHead>
                    <TableHead>Último clique</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {clicks.map((click, index) => (
                    <TableRow key={`${click.recipient_email}-${index}`}>
                      <TableCell className="max-w-[180px] truncate">
                        {click.recipient_email || (
                          <span className="text-muted-foreground">Não identificado</span>
                        )}
                      </TableCell>
                      <TableCell className="max-w-[220px] truncate" title={click.destination_url}>
                        {click.destination_url}
                      </TableCell>
                      <TableCell className="max-w-[160px] truncate">
                        {click.dispatch_name ?? <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-right">{click.click_count}</TableCell>
                      <TableCell>{formatDate(click.last_clicked_at)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </CardContent>
      )}
    </Card>
  );
}
