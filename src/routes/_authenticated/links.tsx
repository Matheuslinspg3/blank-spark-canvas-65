import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, Copy, Link2, Loader2, MousePointerClick, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import {
  deleteTrackedLinkFn,
  listTrackedLinksFn,
  createTrackedLinkFn,
} from "@/lib/tracked-links.functions";
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

export const Route = createFileRoute("/_authenticated/links")({
  head: () => ({
    meta: [
      { title: "Links rastreados — Disparo Tracker" },
      {
        name: "description",
        content: "Crie links curtos que contam cada clique e acompanhe os resultados.",
      },
      { property: "og:title", content: "Links rastreados — Disparo Tracker" },
      {
        property: "og:description",
        content: "Crie links curtos que contam cada clique e acompanhe os resultados.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LinksPage,
});

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function LinksPage() {
  const queryClient = useQueryClient();
  const [url, setUrl] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["tracked-links"],
    queryFn: () => listTrackedLinksFn(),
    refetchInterval: 30_000,
  });

  const createMutation = useMutation({
    mutationFn: (destinationUrl: string) => createTrackedLinkFn({ data: { destinationUrl } }),
    onSuccess: () => {
      setUrl("");
      toast.success("Link criado");
      void queryClient.invalidateQueries({ queryKey: ["tracked-links"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteTrackedLinkFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Link removido");
      void queryClient.invalidateQueries({ queryKey: ["tracked-links"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const handleCreate = () => {
    const trimmed = url.trim();
    if (!/^https?:\/\//i.test(trimmed)) {
      toast.error("Cole um endereço começando com http:// ou https://");
      return;
    }
    createMutation.mutate(trimmed);
  };

  const handleCopy = async (id: string, trackingUrl: string | null) => {
    if (!trackingUrl) return;
    try {
      await navigator.clipboard.writeText(trackingUrl);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      toast.error("Não consegui copiar. Selecione e copie manualmente.");
    }
  };

  const links = data?.links ?? [];
  const totalClicks = links.reduce((sum, l) => sum + l.click_count, 0);
  const clickedLinks = links.filter((l) => l.click_count > 0).length;

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
            <Link2 className="text-primary size-6" />
            Links rastreados
          </h1>
          <p className="text-muted-foreground text-sm">
            Crie links curtos que contam cada clique. Cole o link gerado em qualquer e-mail ou
            molde.
          </p>
        </div>
      </header>

      {data && !data.configured ? (
        <Card className="border-amber-500/50">
          <CardContent className="pt-6">
            <p className="text-sm">
              O endereço público do site (TRACKING_ORIGIN) não está configurado, então os links de
              rastreio não podem ser montados. Fale com o administrador para definir o domínio
              publicado do projeto.
            </p>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Criar novo link</CardTitle>
          <CardDescription>
            Informe o endereço de destino (site, WhatsApp, formulário). O sistema gera um link curto
            que registra cada clique.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Label htmlFor="new-link-url">Endereço de destino</Label>
          <div className="flex gap-2">
            <Input
              id="new-link-url"
              placeholder="https://wa.me/5513… ou https://seusite.com.br"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") handleCreate();
              }}
            />
            <Button onClick={handleCreate} disabled={createMutation.isPending}>
              {createMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                "Gerar link"
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <MousePointerClick className="text-primary size-4" />
            Seus links
          </CardTitle>
          <CardDescription>
            {links.length} links criados · {clickedLinks} com cliques · {totalClicks} cliques no
            total
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-muted-foreground text-sm">Carregando…</p>
          ) : links.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Você ainda não criou nenhum link. Crie o primeiro acima.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Destino</TableHead>
                  <TableHead>Link rastreado</TableHead>
                  <TableHead className="text-right">Cliques</TableHead>
                  <TableHead>Último clique</TableHead>
                  <TableHead className="w-[100px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {links.map((link) => (
                  <TableRow key={link.id}>
                    <TableCell className="max-w-[260px] truncate" title={link.destination_url}>
                      {link.destination_url}
                    </TableCell>
                    <TableCell>
                      {link.tracking_url ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => void handleCopy(link.id, link.tracking_url)}
                        >
                          {copiedId === link.id ? (
                            <Check className="size-4" />
                          ) : (
                            <Copy className="size-4" />
                          )}
                          {copiedId === link.id ? "Copiado" : "Copiar link"}
                        </Button>
                      ) : (
                        <span className="text-muted-foreground text-xs">Indisponível</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">{link.click_count}</TableCell>
                    <TableCell>{formatDate(link.last_clicked_at)}</TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Remover link"
                        disabled={deleteMutation.isPending}
                        onClick={() => deleteMutation.mutate(link.id)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
