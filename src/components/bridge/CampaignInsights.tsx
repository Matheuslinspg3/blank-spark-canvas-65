import { useMutation, useQuery } from "@tanstack/react-query";
import { BrainCircuit, Loader2 } from "lucide-react";
import { useState } from "react";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  analyzeCampaignFn,
  INSIGHT_METRICS,
  type InsightMetricId,
} from "@/lib/campaign-insights.functions";
import { listCampaigns } from "@/lib/campaigns.functions";

export function CampaignInsights() {
  const [campaignId, setCampaignId] = useState("");
  const [metrics, setMetrics] = useState<InsightMetricId[]>(["entregas", "cliques", "horarios", "tempos"]);
  const [question, setQuestion] = useState("");
  const { data: campaigns } = useQuery({ queryKey: ["campaigns"], queryFn: () => listCampaigns() });

  const mutation = useMutation({
    mutationFn: () =>
      analyzeCampaignFn({ data: { campaignId, metrics, question: question.trim() || undefined } }),
    onError: (e: Error) => toast.error(e.message),
  });

  const toggle = (id: InsightMetricId, on: boolean) =>
    setMetrics((m) => (on ? [...m, id] : m.filter((x) => x !== id)));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <BrainCircuit className="text-primary size-4" />
          Análise com IA
        </CardTitle>
        <CardDescription>
          Escolha um disparo e as métricas. A IA resume o desempenho, aponta padrões de clique e
          sugere próximas ações.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>Disparo</Label>
          <Select value={campaignId} onValueChange={setCampaignId}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione um disparo" />
            </SelectTrigger>
            <SelectContent>
              {(campaigns ?? []).map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          {INSIGHT_METRICS.map((m) => (
            <label key={m.id} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={metrics.includes(m.id)}
                onCheckedChange={(v) => toggle(m.id, v === true)}
              />
              {m.label}
            </label>
          ))}
        </div>
        <div className="space-y-2">
          <Label>Pergunta específica (opcional)</Label>
          <Textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ex.: Qual categoria devo priorizar na próxima onda?"
            maxLength={500}
            rows={2}
          />
        </div>
        <Button
          onClick={() => mutation.mutate()}
          disabled={!campaignId || metrics.length === 0 || mutation.isPending}
        >
          {mutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
          {mutation.isPending ? "Analisando…" : "Gerar análise"}
        </Button>
        {mutation.data ? (
          <div className="bg-muted/40 prose prose-sm dark:prose-invert max-w-none rounded-md border p-4">
            <ReactMarkdown>{mutation.data.summary}</ReactMarkdown>
          </div>
        ) : null}
        <p className="text-muted-foreground text-xs">
          Aberturas não são medidas pelo app; a análise usa entregas, cliques e leads. E-mails são
          mascarados antes de ir para a IA.
        </p>
      </CardContent>
    </Card>
  );
}
