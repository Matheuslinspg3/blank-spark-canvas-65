/**
 * Relatório de entregabilidade da campanha: números, alertas de reputação,
 * recomendações e a lista de eventos por destinatário.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle,
  CloudDownload,
  Download,
  Lightbulb,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { downloadFile } from "@/lib/bulk-email";
import {
  EVENT_LABEL,
  computeMetrics,
  eventsToCsv,
  recommendations,
  riskAlerts,
  type EmailEvent,
  type EmailEventStatus,
} from "@/lib/deliverability";
import { listCampaignEvents, syncBrevoEventsFn } from "@/lib/deliverability.functions";

function statusVariant(status: EmailEventStatus): "default" | "secondary" | "destructive" {
  if (status === "entregue") return "default";
  if (status === "enviado") return "secondary";
  return "destructive";
}

export function DeliverabilityReport({ campaignId }: { campaignId: string }) {
  const fetchEvents = useServerFn(listCampaignEvents);
  const syncBrevo = useServerFn(syncBrevoEventsFn);
  const queryClient = useQueryClient();

  const { data, isFetching, refetch } = useQuery({
    queryKey: ["deliverability", campaignId],
    queryFn: () => fetchEvents({ data: { campaignId } }),
    refetchInterval: 60_000,
  });

  const syncMutation = useMutation({
    mutationFn: () => syncBrevo({ data: { days: 30 } }),
    onSuccess: (result) => {
      toast.success(
        `Brevo sincronizada: ${result.fetched} eventos lidos, ${result.updated} atualizados, ${result.inserted} importados.`,
      );
      void queryClient.invalidateQueries({ queryKey: ["deliverability", campaignId] });
      void queryClient.invalidateQueries({ queryKey: ["suppressions"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const events: EmailEvent[] = data ?? [];
  const metrics = computeMetrics(events);
  const alerts = riskAlerts(metrics);
  const tips = recommendations(metrics);

  const cards = [
    { label: "Enviados", value: metrics.total, hint: "total registrado" },
    { label: "Entregues", value: metrics.entregues, hint: `${metrics.deliveryRate}%` },
    {
      label: "Bounces",
      value: metrics.bounceHard + metrics.bounceSoft,
      hint: `${metrics.bounceRate}%`,
    },
    { label: "Spam", value: metrics.spam, hint: `${metrics.spamRate}%` },
    { label: "Erros", value: metrics.erros, hint: "não saíram" },
    { label: "Sem retorno", value: metrics.pendentes, hint: "aguardando Brevo" },
  ];

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="text-primary size-4" />
              Entregabilidade
            </CardTitle>
            <CardDescription>
              Enviados, entregues, bounces e reclamações de spam desta campanha.
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => void refetch()} disabled={isFetching}>
              <RefreshCw className={`size-4 ${isFetching ? "animate-spin" : ""}`} />
              Atualizar
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={syncMutation.isPending}
              onClick={() => syncMutation.mutate()}
            >
              <CloudDownload className={`size-4 ${syncMutation.isPending ? "animate-pulse" : ""}`} />
              {syncMutation.isPending ? "Sincronizando…" : "Sincronizar com a Brevo"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={events.length === 0}
              onClick={() =>
                downloadFile(
                  `entregabilidade-${new Date().toISOString().slice(0, 10)}.csv`,
                  eventsToCsv(events),
                )
              }
            >
              <Download className="size-4" />
              Exportar CSV
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        {alerts.map((alert) => (
          <Alert key={alert.message} variant={alert.level === "critico" ? "destructive" : "default"}>
            <AlertTriangle className="size-4" />
            <AlertTitle>
              {alert.level === "critico" ? "Risco alto de reputação" : "Atenção"}
            </AlertTitle>
            <AlertDescription>{alert.message}</AlertDescription>
          </Alert>
        ))}

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {cards.map((card) => (
            <div key={card.label} className="rounded-lg border p-3">
              <p className="text-muted-foreground text-xs">{card.label}</p>
              <p className="text-xl font-semibold">{card.value}</p>
              <p className="text-muted-foreground text-xs">{card.hint}</p>
            </div>
          ))}
        </div>

        {metrics.total > 0 && (
          <div className="space-y-1">
            <div className="text-muted-foreground flex justify-between text-xs">
              <span>Taxa de entrega confirmada</span>
              <span>{metrics.deliveryRate}%</span>
            </div>
            <Progress value={metrics.deliveryRate} />
          </div>
        )}

        <div className="bg-muted/40 space-y-2 rounded-lg border p-4">
          <p className="flex items-center gap-2 text-sm font-medium">
            <Lightbulb className="size-4" />
            Recomendações para melhorar a taxa de sucesso
          </p>
          <ul className="text-muted-foreground list-disc space-y-1 pl-5 text-sm">
            {tips.map((tip) => (
              <li key={tip}>{tip}</li>
            ))}
          </ul>
        </div>

        {events.length > 0 && (
          <div className="max-h-96 overflow-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>E-mail</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Motivo</TableHead>
                  <TableHead>Enviado em</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.map((event) => (
                  <TableRow key={event.id}>
                    <TableCell className="max-w-[220px] truncate">{event.email}</TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(event.status)}>{EVENT_LABEL[event.status]}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground max-w-[240px] truncate text-xs">
                      {event.reason ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {new Date(event.sent_at).toLocaleString("pt-BR")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
