import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BrainCircuit, Download, Loader2, MousePointerClick } from "lucide-react";
import { useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";

import { analyzeClickersFn, listClickersFn, type Clicker } from "@/lib/clickers.functions";
import { listCampaigns } from "@/lib/campaigns.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—";

const csvEsc = (v: unknown) => {
  const s = v == null ? "" : String(v);
  return /[",;\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
};

function exportCsv(rows: Clicker[]) {
  const header = [
    "email",
    "disparo",
    "primeiro_clique",
    "ultimo_clique",
    "total_cliques",
    "tipo",
    "destino",
  ];
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.recipient_email,
        r.campaign_name ?? "",
        r.first_clicked_at ?? "",
        r.last_clicked_at ?? "",
        r.click_count,
        r.mode === "bridge" ? "Página Ponte" : "Redirecionamento",
        r.destination_url,
      ]
        .map(csvEsc)
        .join(","),
    );
  }
  const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `quem-clicou-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function ClickersExplorer() {
  const [campaignId, setCampaignId] = useState<string>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [bridgeOnly, setBridgeOnly] = useState(false);
  const [question, setQuestion] = useState("");
  const [aiResult, setAiResult] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  const { data: campaigns } = useQuery({ queryKey: ["campaigns"], queryFn: () => listCampaigns() });

  const filters = useMemo(
    () => ({
      campaignId: campaignId === "all" ? undefined : campaignId,
      from: from || undefined,
      to: to || undefined,
      bridgeOnly: bridgeOnly || undefined,
    }),
    [campaignId, from, to, bridgeOnly],
  );

  const fetchClickers = useServerFn(listClickersFn);
  const { data: clickers, isFetching } = useQuery({
    queryKey: ["clickers", filters],
    queryFn: () => fetchClickers({ data: filters }),
  });

  const askAi = async () => {
    setAiLoading(true);
    setAiResult(null);
    try {
      const res = await analyzeClickersFn({
        data: { ...filters, question: question.trim() || undefined },
      });
      setAiResult(res.summary);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha na análise.");
    } finally {
      setAiLoading(false);
    }
  };

  const rows = clickers ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <MousePointerClick className="text-primary size-4" />
          Quem clicou
        </CardTitle>
        <CardDescription>
          Lista dos destinatários que clicaram, com filtro por disparo e período (horário de
          Brasília). Exporte em CSV ou pergunte à IA sobre a lista filtrada.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-4">
          <div className="space-y-1">
            <Label>Disparo</Label>
            <Select value={campaignId} onValueChange={setCampaignId}>
              <SelectTrigger>
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os disparos</SelectItem>
                {(campaigns ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>De</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Até</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="flex items-end pb-2">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={bridgeOnly} onCheckedChange={(v) => setBridgeOnly(v === true)} />
              Só Página Ponte
            </label>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-muted-foreground text-sm">
            {isFetching ? "Carregando…" : `${rows.length} destinatário(s) clicaram`}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => exportCsv(rows)}
            disabled={rows.length === 0}
          >
            <Download className="size-4" />
            Exportar CSV
          </Button>
        </div>

        <div className="max-h-96 overflow-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 sticky top-0">
              <tr>
                <th className="p-2 text-left font-medium">E-mail</th>
                <th className="p-2 text-left font-medium">Disparo</th>
                <th className="p-2 text-left font-medium">Primeiro clique</th>
                <th className="p-2 text-left font-medium">Cliques</th>
                <th className="p-2 text-left font-medium">Tipo</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="p-2">{r.recipient_email || "—"}</td>
                  <td className="p-2">{r.campaign_name ?? "—"}</td>
                  <td className="p-2">{fmtDate(r.first_clicked_at)}</td>
                  <td className="p-2">{r.click_count}</td>
                  <td className="p-2">
                    {r.mode === "bridge" ? "Página Ponte" : "Redirecionamento"}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && !isFetching ? (
                <tr>
                  <td colSpan={5} className="text-muted-foreground p-4 text-center">
                    Nenhum clique no período/filtro escolhido.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="space-y-2 border-t pt-4">
          <Label>Perguntar à IA sobre essa lista (opcional)</Label>
          <Textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ex.: Quais domínios mais clicaram no dia 29?"
            maxLength={500}
            rows={2}
          />
          <Button onClick={askAi} disabled={aiLoading || rows.length === 0} variant="secondary">
            {aiLoading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <BrainCircuit className="size-4" />
            )}
            {aiLoading ? "Analisando…" : "Perguntar à IA"}
          </Button>
          {aiResult ? (
            <div className="bg-muted/40 prose prose-sm dark:prose-invert max-w-none rounded-md border p-4">
              <ReactMarkdown>{aiResult}</ReactMarkdown>
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
