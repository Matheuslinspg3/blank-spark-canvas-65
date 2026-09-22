/**
 * Configurações de entregabilidade: limite diário, contatos bloqueados e a URL
 * do webhook da Brevo que alimenta bounces e reclamações de spam.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Ban, Copy, Gauge, Loader2, Plus, Trash2, Webhook } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DEFAULT_LIMITS,
  SUPPRESSION_LABEL,
  clampLimit,
  loadLimits,
  saveLimits,
} from "@/lib/deliverability";
import {
  addSuppression,
  getWebhookSecret,
  listSuppressions,
  removeSuppression,
} from "@/lib/deliverability.functions";

export function DeliverabilitySettings() {
  const queryClient = useQueryClient();
  const fetchSuppressions = useServerFn(listSuppressions);
  const fetchSecret = useServerFn(getWebhookSecret);
  const addFn = useServerFn(addSuppression);
  const removeFn = useServerFn(removeSuppression);

  const [limit, setLimit] = useState(DEFAULT_LIMITS.dailyLimit);
  const [newEmail, setNewEmail] = useState("");

  useEffect(() => {
    setLimit(loadLimits().dailyLimit);
  }, []);

  const { data: suppressions = [], isLoading } = useQuery({
    queryKey: ["suppressions"],
    queryFn: () => fetchSuppressions({}),
  });

  const { data: secretData } = useQuery({
    queryKey: ["webhook-secret"],
    queryFn: () => fetchSecret({}),
  });

  const webhookUrl =
    typeof window !== "undefined" && secretData?.secret
      ? `${window.location.origin}/api/public/hooks/brevo?s=${secretData.secret}`
      : "";

  const addMutation = useMutation({
    mutationFn: (email: string) => addFn({ data: { email, reason: "manual" } }),
    onSuccess: () => {
      setNewEmail("");
      toast.success("Contato bloqueado");
      void queryClient.invalidateQueries({ queryKey: ["suppressions"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => removeFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Bloqueio removido");
      void queryClient.invalidateQueries({ queryKey: ["suppressions"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Gauge className="size-4" />
            Limite diário de disparo
          </CardTitle>
          <CardDescription>
            Máximo de e-mails em 24 horas. O app avisa a partir de 80% e pausa o disparo ao atingir
            o limite — isso evita picos que queimam a reputação do domínio.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="space-y-2">
            <Label htmlFor="dailyLimit">E-mails por dia</Label>
            <Input
              id="dailyLimit"
              type="number"
              min={1}
              className="w-40"
              value={limit}
              onChange={(event) => setLimit(Number(event.target.value))}
            />
          </div>
          <Button
            onClick={() => {
              const value = clampLimit(limit);
              setLimit(value);
              saveLimits({ dailyLimit: value });
              toast.success(`Limite salvo: ${value} e-mails por dia`);
            }}
          >
            Salvar limite
          </Button>
          <p className="text-muted-foreground text-xs">
            Domínio novo? Comece com 50/dia e aumente aos poucos.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Webhook className="size-4" />
            Webhook da Brevo
          </CardTitle>
          <CardDescription>
            Cole esta URL na Brevo (Transactional → Settings → Webhooks) marcando os eventos
            entregue, hard bounce, soft bounce, spam, bloqueado e e-mail inválido. É assim que o app
            descobre endereços inválidos e reclamações.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2">
          <Input readOnly value={webhookUrl} className="min-w-[260px] flex-1 font-mono text-xs" />
          <Button
            variant="outline"
            disabled={!webhookUrl}
            onClick={() => {
              void navigator.clipboard.writeText(webhookUrl);
              toast.success("URL copiada");
            }}
          >
            <Copy className="size-4" />
            Copiar
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Ban className="size-4" />
            Contatos bloqueados
          </CardTitle>
          <CardDescription>
            Endereços que nunca mais recebem disparos. Bounces e reclamações entram aqui
            automaticamente.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Input
              placeholder="email@empresa.com"
              value={newEmail}
              className="min-w-[220px] flex-1"
              onChange={(event) => setNewEmail(event.target.value)}
            />
            <Button
              disabled={!newEmail.trim() || addMutation.isPending}
              onClick={() => addMutation.mutate(newEmail.trim())}
            >
              {addMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Plus className="size-4" />
              )}
              Bloquear
            </Button>
          </div>

          {isLoading && <p className="text-muted-foreground text-sm">Carregando…</p>}
          {!isLoading && suppressions.length === 0 && (
            <p className="text-muted-foreground text-sm">Nenhum contato bloqueado até agora.</p>
          )}

          <div className="space-y-2">
            {suppressions.map((item) => (
              <div
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{item.email}</p>
                  <p className="text-muted-foreground text-xs">
                    {item.source || "manual"} ·{" "}
                    {new Date(item.created_at).toLocaleDateString("pt-BR")}
                    {item.detail ? ` · ${item.detail}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={item.reason === "manual" ? "secondary" : "destructive"}>
                    {SUPPRESSION_LABEL[item.reason]}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeMutation.mutate(item.id)}
                    aria-label={`Remover bloqueio de ${item.email}`}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </>
  );
}
