import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft,
  Loader2,
  Mail,
  RefreshCw,
  Save,
  Send,
  Settings2,
  Sparkles,
  TestTube2,
  Upload,
  UserRound,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { CSVUploader } from "./CSVUploader";
import { DailyLimitBanner } from "./DailyLimitBanner";
import { DeliverabilityReport } from "./DeliverabilityReport";
import { ScheduleFields } from "./ScheduleFields";
import { ResultsTable } from "./ResultsTable";
import { SenderFields } from "./SenderFields";

import { useSendGuard } from "@/hooks/use-send-guard";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import {
  DEFAULT_AI_SETTINGS,
  callAi,
  isAiConfigured,
  loadAiSettings,
  type AiSettings,
} from "@/lib/ai-config";
import { downloadFile, buildReportCsv, type Recipient, type SendResult } from "@/lib/bulk-email";
import { STATUS_LABEL, type Campaign, type CampaignPatch, type CampaignStatus } from "@/lib/campaigns";
import { updateCampaign } from "@/lib/campaigns.functions";
import { cancelScheduleFn, scheduleCampaignFn } from "@/lib/schedule-dispatch.functions";
import { sendSimpleEmailsFn } from "@/lib/send-email.functions";
import { defaultSender, loadSenders } from "@/lib/senders";
import {
  DEFAULT_SCHEDULE,
  sleep,
  waitForWindow,
  type SendSchedule,
} from "@/lib/send-schedule";
import {
  SIMPLE_BODY_COLUMN,
  SIMPLE_SUBJECT_COLUMN,
  buildSimpleSystemPrompt,
  buildSimpleUserPrompt,
  parseBrief,
  parseSimpleEmail,
  simpleLetterHtml,
  type SimpleBrief,
} from "@/lib/simple-dispatch";
import { promoSubjectWarnings } from "@/lib/bulk-email";

const CONCURRENCY = 3;

type RowStatus = "pendente" | "gerando" | "ok" | "erro";

function isReady(row: Recipient): boolean {
  return (
    (row[SIMPLE_SUBJECT_COLUMN] ?? "").trim().length > 0 &&
    (row[SIMPLE_BODY_COLUMN] ?? "").trim().length > 0
  );
}

export function SimpleDispatch({ campaign }: { campaign: Campaign }) {
  const save = useServerFn(updateCampaign);
  const sendSimple = useServerFn(sendSimpleEmailsFn);
  const scheduleCampaign = useServerFn(scheduleCampaignFn);
  const guard = useSendGuard(campaign.id);

  const [name, setName] = useState(campaign.name);
  const [status, setStatus] = useState<CampaignStatus>(campaign.status);
  const [brief, setBrief] = useState<SimpleBrief>(() => parseBrief(campaign.brief));
  const [senderName, setSenderName] = useState(campaign.sender_name);
  const [senderEmail, setSenderEmail] = useState(campaign.sender_email);
  const [recipients, setRecipients] = useState<Recipient[]>(campaign.recipients ?? []);
  const [csvColumns, setCsvColumns] = useState<string[]>(
    Object.keys((campaign.recipients ?? [])[0] ?? {}),
  );
  const [results, setResults] = useState<SendResult[]>(campaign.results ?? []);
  const [settings, setSettings] = useState<AiSettings>(DEFAULT_AI_SETTINGS);
  const [statuses, setStatuses] = useState<Record<number, RowStatus>>({});
  const [errors, setErrors] = useState<Record<number, string>>({});
  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState(0);
  const [schedule, setSchedule] = useState<SendSchedule>(DEFAULT_SCHEDULE);
  const [waitingWindow, setWaitingWindow] = useState(false);
  const [testEmail, setTestEmail] = useState("");
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);

  const stopRef = useRef(false);
  const sendCancelRef = useRef(false);
  const latest = useRef(recipients);
  latest.current = recipients;

  useEffect(() => {
    setSettings(loadAiSettings());
    const sender = defaultSender(loadSenders());
    if (sender) {
      setSenderName((current) => current || sender.name);
      setSenderEmail((current) => current || sender.email);
    }
    if (!brief.senderName && sender?.name) {
      setBrief((current) => ({ ...current, senderName: sender.name }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const configured = isAiConfigured(settings);
  const readyCount = recipients.filter(isReady).length;
  const locked = sending || status === "enviando";
  const isScheduled = status === "agendado";
  const [scheduling, setScheduling] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const briefJson = useMemo(() => JSON.stringify(brief), [brief]);

  async function persist(patch: CampaignPatch) {
    try {
      await save({ data: { id: campaign.id, patch } });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar.");
    }
  }

  async function handleSave() {
    setSaving(true);
    await persist({
      name,
      brief: briefJson,
      sender_name: senderName,
      sender_email: senderEmail,
      recipients,
      total_count: recipients.length,
    });
    setSaving(false);
    toast.success("Rascunho salvo");
  }

  function updateRow(index: number, patch: Record<string, string>) {
    setRecipients(latest.current.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  async function generateOne(index: number) {
    const recipient = latest.current[index];
    if (!recipient) return;
    setStatuses((prev) => ({ ...prev, [index]: "gerando" }));
    try {
      const raw = await callAi(
        settings,
        buildSimpleUserPrompt(recipient, index),
        buildSimpleSystemPrompt(brief),
      );
      const { subject, body } = parseSimpleEmail(raw);
      setRecipients(
        latest.current.map((row, i) =>
          i === index ? { ...row, [SIMPLE_SUBJECT_COLUMN]: subject, [SIMPLE_BODY_COLUMN]: body } : row,
        ),
      );
      setStatuses((prev) => ({ ...prev, [index]: "ok" }));
      setErrors((prev) => ({ ...prev, [index]: "" }));
    } catch (error) {
      setStatuses((prev) => ({ ...prev, [index]: "erro" }));
      setErrors((prev) => ({
        ...prev,
        [index]: error instanceof Error ? error.message : "Falha desconhecida",
      }));
    }
  }

  async function generateAll(onlyEmpty: boolean) {
    if (!configured) {
      toast.error("Configure a base URL e a API key da IA em Configurações.");
      return;
    }
    if (!brief.proposal.trim()) {
      toast.error("Escreva a proposta do disparo antes de gerar os textos.");
      return;
    }
    const targets = recipients
      .map((row, index) => ({ row, index }))
      .filter(({ row }) => !onlyEmpty || !isReady(row))
      .map(({ index }) => index);

    if (targets.length === 0) {
      toast.info("Todos os e-mails já estão escritos.");
      return;
    }

    stopRef.current = false;
    setGenerating(true);

    let cursor = 0;
    const next = () => (cursor < targets.length ? targets[cursor++]! : -1);

    async function worker() {
      for (let index = next(); index !== -1; index = next()) {
        if (stopRef.current) return;
        await generateOne(index);
      }
    }

    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, targets.length) }, worker));
    setGenerating(false);

    const ok = latest.current.filter(isReady).length;
    await persist({ recipients: latest.current, brief: briefJson, total_count: latest.current.length });
    if (stopRef.current) toast.info(`Geração interrompida com ${ok} e-mails prontos`);
    else if (ok === recipients.length) toast.success(`${ok} e-mails prontos`);
    else toast.warning(`${ok} de ${recipients.length} e-mails prontos`);
  }

  async function handleTest() {
    const target = testEmail.trim();
    const sample = recipients.find(isReady);
    if (!target) {
      toast.error("Informe um e-mail para o teste.");
      return;
    }
    if (!sample) {
      toast.error("Gere ao menos um e-mail antes de testar.");
      return;
    }
    if (!senderEmail.trim()) {
      toast.error("Escolha o remetente verificado.");
      return;
    }

    setTesting(true);
    try {
      const [result] = await sendSimple({
        data: {
          senderName,
          senderEmail,
          messages: [
            {
              email: target,
              subject: `[TESTE] ${sample[SIMPLE_SUBJECT_COLUMN] ?? ""}`,
              html: simpleLetterHtml(sample[SIMPLE_BODY_COLUMN] ?? ""),
            },
          ],
        },
      });
      if (result?.success) toast.success(`Teste enviado para ${target}`);
      else toast.error(result?.error ?? "Falha ao enviar o teste.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao enviar o teste.");
    } finally {
      setTesting(false);
    }
  }

  async function handleSend() {
    const ready = recipients.filter(isReady);
    if (ready.length === 0) {
      toast.error("Nenhum e-mail pronto para enviar.");
      return;
    }
    if (!senderEmail.trim()) {
      toast.error("Escolha o remetente verificado.");
      return;
    }

    // Com agenda ligada, quem envia é o servidor: pode fechar a aba.
    if (schedule.enabled) {
      const queued = ready.map((row) => ({
        email: row["email"] ?? "",
        subject: row[SIMPLE_SUBJECT_COLUMN] ?? "",
        html: simpleLetterHtml(row[SIMPLE_BODY_COLUMN] ?? ""),
      }));
      try {
        await scheduleCampaign({
          data: {
            campaignId: campaign.id,
            schedule,
            messages: queued,
            senderName,
            senderEmail,
            recipients,
            brief: briefJson,
          },
        });
        setStatus("agendado");
        setResults([]);
        toast.success(
          `${queued.length} e-mails programados. O envio continua no servidor, mesmo com o site fechado.`,
        );
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Falha ao programar o disparo.");
      }
      return;
    }

    sendCancelRef.current = false;
    setSending(true);
    setStatus("enviando");
    setProgress(0);
    const startedAt = new Date().toISOString();
    await persist({
      status: "enviando",
      started_at: startedAt,
      recipients,
      brief: briefJson,
      sender_name: senderName,
      sender_email: senderEmail,
      total_count: recipients.length,
    });

    try {
      const messages = ready.map((row) => ({
        email: row["email"] ?? "",
        subject: row[SIMPLE_SUBJECT_COLUMN] ?? "",
        html: simpleLetterHtml(row[SIMPLE_BODY_COLUMN] ?? ""),
      }));
      const sent: SendResult[] = [];
      for (const [index, message] of messages.entries()) {
        const canSend = await waitForWindow(
          schedule,
          () => sendCancelRef.current,
          setWaitingWindow,
        );
        if (!canSend) break;
        if (index > 0) await sleep(schedule.enabled ? schedule.intervalSeconds * 1000 : 1000);
        const [result] = await sendSimple({
          data: {
            senderName,
            senderEmail,
            messages: [message],
            campaignId: campaign.id,
            dailyLimit: guard.dailyLimit,
          },
        });
        sent.push(result ?? { email: message.email, success: false, error: "Sem resposta." });
        setResults([...sent]);
        setProgress(Math.round(((index + 1) / messages.length) * 100));

        if (result?.blocked === "limit") {
          toast.error("Limite diário atingido — o disparo foi pausado.");
          break;
        }
        // A cada 10 envios, confere bounce/spam e para se estiver arriscado.
        if ((index + 1) % 10 === 0) {
          const risk = await guard.checkRisk();
          if (risk.stop) {
            toast.error(risk.alerts[0]?.message ?? "Taxa de bounce/spam alta: disparo interrompido.");
            break;
          }
        }
      }
      setWaitingWindow(false);
      setProgress(100);
      void guard.refreshUsage();
      const okCount = sent.filter((r) => r.success).length;
      const skipped = sent.filter((r) => r.blocked === "suppressed").length;
      const finalStatus: CampaignStatus = okCount > 0 ? "concluido" : "erro";
      setStatus(finalStatus);
      await persist({
        status: finalStatus,
        results: sent,
        sent_count: okCount,
        finished_at: new Date().toISOString(),
      });
      toast.success(
        `${okCount} de ${sent.length} e-mails enviados${skipped > 0 ? ` · ${skipped} bloqueados` : ""}`,
      );
    } catch (error) {
      setStatus("erro");
      await persist({ status: "erro" });
      toast.error(error instanceof Error ? error.message : "Falha no disparo.");
    } finally {
      setSending(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-[900px] space-y-6 px-4 py-8">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-2">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/disparos">
              <ArrowLeft className="size-4" />
              Meus disparos
            </Link>
          </Button>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={name}
              disabled={locked}
              className="h-9 w-[280px]"
              aria-label="Nome do disparo"
              onChange={(e) => setName(e.target.value)}
            />
            <Badge variant="secondary">Simples</Badge>
            <Badge variant="outline">{STATUS_LABEL[status]}</Badge>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link to="/configuracoes">
              <Settings2 className="size-4" />
              Configurações
            </Link>
          </Button>
          <Button size="sm" variant="secondary" disabled={saving || locked} onClick={() => void handleSave()}>
            <Save className="size-4" />
            Salvar rascunho
          </Button>
        </div>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <UserRound className="text-primary size-4" />
            Quem envia
          </CardTitle>
          <CardDescription>
            Use um remetente verificado na Brevo (ex.: rh@cafcm.org.br) e o nome que assina o e-mail.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <SenderFields
            senderName={senderName}
            senderEmail={senderEmail}
            disabled={locked}
            onChange={(patch) => {
              if (patch.senderName !== undefined) setSenderName(patch.senderName);
              if (patch.senderEmail !== undefined) setSenderEmail(patch.senderEmail);
            }}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="assinaNome">Nome de quem assina</Label>
              <Input
                id="assinaNome"
                value={brief.senderName}
                disabled={locked}
                placeholder="Rebeca"
                onChange={(e) => setBrief({ ...brief, senderName: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="assinaCargo">Cargo (opcional)</Label>
              <Input
                id="assinaCargo"
                value={brief.senderRole}
                disabled={locked}
                placeholder="Presidente · CAFCM"
                onChange={(e) => setBrief({ ...brief, senderRole: e.target.value })}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Mail className="text-primary size-4" />
            Proposta do disparo
          </CardTitle>
          <CardDescription>
            Em uma ou duas frases, diga o objetivo. A IA escreve o resto usando a proposta comercial da
            CAFCM.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            value={brief.proposal}
            disabled={locked}
            rows={3}
            aria-label="Proposta do disparo"
            placeholder="Apresentar o convênio de socioaprendizagem para construtoras da região e agendar uma conversa rápida."
            onChange={(e) => setBrief({ ...brief, proposal: e.target.value })}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Upload className="text-primary size-4" />
            Lista de contatos
          </CardTitle>
          <CardDescription>CSV com a coluna email. Nome, empresa e segmento ajudam a IA.</CardDescription>
        </CardHeader>
        <CardContent>
          <CSVUploader
            recipients={recipients}
            columns={csvColumns}
            disabled={locked}
            onLoaded={(cols, rows) => {
              setCsvColumns(cols);
              setRecipients(rows);
              setStatuses({});
              setErrors({});
              void persist({ recipients: rows, total_count: rows.length });
            }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="text-primary size-4" />
            E-mails gerados
          </CardTitle>
          <CardDescription>
            {readyCount} de {recipients.length} prontos. Você pode editar assunto e texto antes de
            enviar.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!configured && (
            <Alert>
              <Settings2 className="size-4" />
              <AlertTitle>IA não configurada</AlertTitle>
              <AlertDescription>
                Informe a base URL e a API key da IA em Configurações para gerar os textos.
              </AlertDescription>
            </Alert>
          )}

          <div className="flex flex-wrap gap-2">
            <Button
              disabled={locked || generating || recipients.length === 0}
              onClick={() => void generateAll(true)}
            >
              {generating ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
              {generating ? "Gerando…" : "Gerar textos com IA"}
            </Button>
            <Button
              variant="outline"
              disabled={locked || generating || recipients.length === 0}
              onClick={() => void generateAll(false)}
            >
              <RefreshCw className="size-4" />
              Regerar todos
            </Button>
            {generating && (
              <Button variant="ghost" onClick={() => (stopRef.current = true)}>
                Parar
              </Button>
            )}
          </div>

          {recipients.length === 0 && (
            <p className="text-muted-foreground text-sm">Carregue o CSV para montar a lista.</p>
          )}

          <div className="space-y-3">
            {recipients.map((row, index) => {
              const rowStatus: RowStatus =
                statuses[index] === "gerando" || statuses[index] === "erro"
                  ? statuses[index]!
                  : isReady(row)
                    ? "ok"
                    : "pendente";
              const subject = row[SIMPLE_SUBJECT_COLUMN] ?? "";
              const warnings = promoSubjectWarnings(subject);

              return (
                <div key={`${row["email"]}-${index}`} className="space-y-2 rounded-lg border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{row["email"]}</p>
                      <p className="text-muted-foreground truncate text-xs">
                        {[row["nome"], row["empresa"], row["segmento"], row["categoria"]]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={
                          rowStatus === "ok" ? "default" : rowStatus === "erro" ? "destructive" : "secondary"
                        }
                      >
                        {rowStatus === "ok"
                          ? "Pronto"
                          : rowStatus === "gerando"
                            ? "Gerando…"
                            : rowStatus === "erro"
                              ? "Erro"
                              : "Pendente"}
                      </Badge>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={locked || !configured || rowStatus === "gerando"}
                        onClick={() => void generateOne(index)}
                      >
                        <RefreshCw className="size-4" />
                        Regerar
                      </Button>
                    </div>
                  </div>

                  <Input
                    value={subject}
                    disabled={locked}
                    aria-label={`Assunto para ${row["email"]}`}
                    placeholder="Assunto do e-mail"
                    onChange={(e) => updateRow(index, { [SIMPLE_SUBJECT_COLUMN]: e.target.value })}
                  />
                  {warnings.length > 0 && (
                    <p className="text-destructive text-xs">
                      Risco de Promoções no assunto: {warnings.join(", ")}
                    </p>
                  )}
                  <Textarea
                    value={row[SIMPLE_BODY_COLUMN] ?? ""}
                    disabled={locked}
                    rows={7}
                    aria-label={`Texto para ${row["email"]}`}
                    placeholder="Texto do e-mail"
                    onChange={(e) => updateRow(index, { [SIMPLE_BODY_COLUMN]: e.target.value })}
                  />
                  {errors[index] && <p className="text-destructive text-xs">{errors[index]}</p>}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Send className="text-primary size-4" />
            Enviar
          </CardTitle>
          <CardDescription>1 e-mail por segundo. Só as linhas prontas são enviadas.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              type="email"
              value={testEmail}
              disabled={locked}
              className="h-9 w-[260px]"
              aria-label="E-mail para teste"
              placeholder="voce@empresa.com"
              onChange={(e) => setTestEmail(e.target.value)}
            />
            <Button variant="outline" size="sm" disabled={locked || testing} onClick={() => void handleTest()}>
              <TestTube2 className="size-4" />
              {testing ? "Enviando…" : "Enviar teste"}
            </Button>
          </div>

          <ScheduleFields
            schedule={schedule}
            pending={readyCount}
            disabled={locked}
            onChange={setSchedule}
          />

          <DailyLimitBanner
            dailyLimit={guard.dailyLimit}
            sentLast24h={guard.sentLast24h}
            nearLimit={guard.nearLimit}
            limitReached={guard.limitReached}
          />

          {sending && <Progress value={progress} />}
          {waitingWindow && (
            <p className="text-muted-foreground text-xs">
              Fora da janela de envio — aguardando {schedule.startTime} para continuar.
            </p>
          )}

          <Button
            disabled={locked || readyCount === 0 || guard.limitReached}
            onClick={() => void handleSend()}
          >
            {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            {sending ? "Enviando…" : `Enviar ${readyCount} e-mails`}
          </Button>
          {sending && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                sendCancelRef.current = true;
                setWaitingWindow(false);
              }}
            >
              Parar envio
            </Button>
          )}

          {results.length > 0 && (
            <ResultsTable
              results={results}
              onExportReport={() =>
                downloadFile(
                  `relatorio-${new Date().toISOString().slice(0, 10)}.csv`,
                  buildReportCsv(recipients, {}, results, campaign.finished_at),
                )
              }
            />
          )}
        </CardContent>
      </Card>

      <DeliverabilityReport campaignId={campaign.id} />
    </main>
  );
}
