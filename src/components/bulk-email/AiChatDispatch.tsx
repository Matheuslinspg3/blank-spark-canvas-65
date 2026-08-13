import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft,
  Bot,
  FileText,
  Loader2,
  Paperclip,
  RefreshCw,
  Send,
  Settings2,
  UserRound,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";

import { DailyLimitBanner } from "./DailyLimitBanner";
import { DeliverabilityReport } from "./DeliverabilityReport";
import { ResultsTable } from "./ResultsTable";
import { ScheduleFields } from "./ScheduleFields";


import { useSendGuard } from "@/hooks/use-send-guard";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import {
  CHAT_GREETING,
  buildChatSystemPrompt,
  describeSnapshot,
  parseChatTurn,
  type ChatAction,
  type ChatMessage,
} from "@/lib/ai-chat-dispatch";
import {
  DEFAULT_AI_SETTINGS,
  callAi,
  isAiConfigured,
  loadAiSettings,
  type AiSettings,
} from "@/lib/ai-config";
import {
  buildReportCsv,
  downloadFile,
  parseCsv,
  promoSubjectWarnings,
  type Recipient,
  type SendResult,
} from "@/lib/bulk-email";
import { STATUS_LABEL, type Campaign, type CampaignPatch, type CampaignStatus } from "@/lib/campaigns";
import { listCampaigns, updateCampaign } from "@/lib/campaigns.functions";
import { sendSimpleEmailsFn } from "@/lib/send-email.functions";
import { defaultSender, loadSenders } from "@/lib/senders";
import {
  DEFAULT_SCHEDULE,
  sleep,
  waitForWindow,
  type SendSchedule,
} from "@/lib/send-schedule";
import {
  TEMPLATE_PRESETS,
  parseTemplatePlan,
  renderBody,
  renderSubject,
  resolveTemplate,
  type MoldeTemplate,
} from "@/lib/template-dispatch";

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

const CONCURRENCY = 3;

function isReady(row: Recipient): boolean {
  return (
    (row[SIMPLE_SUBJECT_COLUMN] ?? "").trim().length > 0 &&
    (row[SIMPLE_BODY_COLUMN] ?? "").trim().length > 0
  );
}

function backupKey(id: string) {
  return `bulk-email:ia-chat:${id}`;
}

type Backup = {
  chat: ChatMessage[];
  recipients: Recipient[];
  brief: SimpleBrief;
  senderName: string;
  senderEmail: string;
};

export function AiChatDispatch({ campaign }: { campaign: Campaign }) {
  const save = useServerFn(updateCampaign);
  const sendSimple = useServerFn(sendSimpleEmailsFn);
  const guard = useSendGuard(campaign.id);

  const [status, setStatus] = useState<CampaignStatus>(campaign.status);
  const [chat, setChat] = useState<ChatMessage[]>(
    campaign.chat?.length ? campaign.chat : [CHAT_GREETING],
  );
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [brief, setBrief] = useState<SimpleBrief>(() => parseBrief(campaign.brief));
  const [senderName, setSenderName] = useState(campaign.sender_name);
  const [senderEmail, setSenderEmail] = useState(campaign.sender_email);
  const [recipients, setRecipients] = useState<Recipient[]>(campaign.recipients ?? []);
  const [results, setResults] = useState<SendResult[]>(campaign.results ?? []);
  const [settings, setSettings] = useState<AiSettings>(DEFAULT_AI_SETTINGS);
  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState(0);
  const [pendingSend, setPendingSend] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [schedule, setSchedule] = useState<SendSchedule>(DEFAULT_SCHEDULE);
  const [waiting, setWaiting] = useState(false);

  // Moldes já criados nos disparos "com molde" + moldes prontos da CAFCM.
  const fetchCampaigns = useServerFn(listCampaigns);
  const { data: allCampaigns } = useQuery({
    queryKey: ["campaigns", "moldes"],
    queryFn: () => fetchCampaigns(),
  });
  const molds = useMemo<MoldeTemplate[]>(() => {
    const saved = (allCampaigns ?? [])
      .filter((item) => item.mode === "molde")
      .flatMap((item) =>
        parseTemplatePlan(item.brief).templates.map((template) => ({
          ...template,
          name: template.name || item.name,
        })),
      )
      .filter((template) => template.subject.trim() && template.body.trim());
    const presets = TEMPLATE_PRESETS.map((preset) => preset.build());
    return [...saved, ...presets];
  }, [allCampaigns]);


  const fileRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sendCancelRef = useRef(false);
  const dirtyRef = useRef(false);
  const latest = useRef(recipients);
  latest.current = recipients;

  const configured = isAiConfigured(settings);
  const readyCount = recipients.filter(isReady).length;
  const locked = sending || status === "enviando";
  const briefJson = useMemo(() => JSON.stringify(brief), [brief]);

  // Configuração de IA + remetente padrão + recuperação de backup local.
  useEffect(() => {
    setSettings(loadAiSettings());
    const sender = defaultSender(loadSenders());
    if (sender) {
      setSenderName((current) => current || sender.name);
      setSenderEmail((current) => current || sender.email);
      setBrief((current) => (current.senderName ? current : { ...current, senderName: sender.name }));
    }
    try {
      const raw = localStorage.getItem(backupKey(campaign.id));
      if (raw && (campaign.recipients ?? []).length === 0) {
        const backup = JSON.parse(raw) as Backup;
        if (backup.recipients?.length || backup.chat?.length > 1) {
          setChat(backup.chat ?? [CHAT_GREETING]);
          setRecipients(backup.recipients ?? []);
          if (backup.brief) setBrief(backup.brief);
          if (backup.senderName) setSenderName(backup.senderName);
          if (backup.senderEmail) setSenderEmail(backup.senderEmail);
          toast.info("Rascunho recuperado do navegador.");
        }
      }
    } catch {
      /* backup opcional */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [chat, thinking]);

  async function persist(patch: CampaignPatch) {
    try {
      await save({ data: { id: campaign.id, patch } });
      setSavedAt(new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }));
      dirtyRef.current = false;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar.");
    }
  }

  // Autosave (~1,5s) + backup imediato no navegador.
  useEffect(() => {
    dirtyRef.current = true;
    try {
      localStorage.setItem(
        backupKey(campaign.id),
        JSON.stringify({ chat, recipients, brief, senderName, senderEmail } satisfies Backup),
      );
    } catch {
      /* quota cheia: ignora */
    }
    const timer = setTimeout(() => {
      void persist({
        chat,
        recipients,
        brief: briefJson,
        sender_name: senderName,
        sender_email: senderEmail,
        total_count: recipients.length,
      });
    }, 1500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chat, recipients, briefJson, senderName, senderEmail]);

  useEffect(() => {
    function warn(event: BeforeUnloadEvent) {
      if (!dirtyRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  function pushAssistant(content: string, extra: Partial<ChatMessage> = {}) {
    setChat((prev) => [...prev, { role: "assistant", content, at: new Date().toISOString(), ...extra }]);
  }

  function snapshot() {
    const rows = latest.current;
    return describeSnapshot({
      senderName,
      senderEmail,
      signatureName: brief.senderName,
      signatureRole: brief.senderRole,
      proposal: brief.proposal,
      total: rows.length,
      ready: rows.filter(isReady).length,
      columns: Object.keys(rows[0] ?? {}),
      sampleEmails: rows.slice(0, 3).map((row) => row["email"] ?? ""),
    });
  }

  // ---------- geração dos e-mails ----------

  async function generateOne(index: number, briefOverride?: SimpleBrief) {
    const recipient = latest.current[index];
    if (!recipient) return false;
    try {
      const raw = await callAi(
        settings,
        buildSimpleUserPrompt(recipient, index),
        buildSimpleSystemPrompt(briefOverride ?? brief),
      );
      const { subject, body } = parseSimpleEmail(raw);
      setRecipients(
        latest.current.map((row, i) =>
          i === index
            ? { ...row, [SIMPLE_SUBJECT_COLUMN]: subject, [SIMPLE_BODY_COLUMN]: body }
            : row,
        ),
      );
      return true;
    } catch {
      return false;
    }
  }

  async function generateAll(onlyMissing: boolean, briefOverride?: SimpleBrief) {
    const targets = latest.current
      .map((row, index) => ({ row, index }))
      .filter(({ row }) => !onlyMissing || !isReady(row))
      .map(({ index }) => index);
    if (targets.length === 0) return 0;

    setGenerating(true);
    let cursor = 0;
    let ok = 0;
    const next = () => (cursor < targets.length ? targets[cursor++]! : -1);

    async function worker() {
      for (let index = next(); index !== -1; index = next()) {
        if (await generateOne(index, briefOverride)) ok += 1;
      }
    }

    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, targets.length) }, worker));
    setGenerating(false);
    return ok;
  }

  // ---------- envio ----------

  async function runTest(target: string) {
    const sample = latest.current.find(isReady);
    if (!target || !sample) return "Preciso de um e-mail de destino e de ao menos um texto pronto.";
    if (!senderEmail.trim()) return "Falta escolher o remetente verificado na Brevo.";
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
      return result?.success ? `Teste enviado para ${target}.` : (result?.error ?? "Falha no teste.");
    } catch (error) {
      return error instanceof Error ? error.message : "Falha no teste.";
    }
  }

  async function runSendAll() {
    const ready = latest.current.filter(isReady);
    if (ready.length === 0) {
      pushAssistant("Não há e-mails prontos para enviar.");
      return;
    }
    if (!senderEmail.trim()) {
      pushAssistant("Escolha o remetente verificado antes de enviar.");
      return;
    }

    sendCancelRef.current = false;
    setSending(true);
    setStatus("enviando");
    setProgress(0);
    await persist({
      status: "enviando",
      started_at: new Date().toISOString(),
      recipients: latest.current,
      brief: briefJson,
      sender_name: senderName,
      sender_email: senderEmail,
      total_count: latest.current.length,
    });

    const sent: SendResult[] = [];
    try {
      const messages = ready.map((row) => ({
        email: row["email"] ?? "",
        subject: row[SIMPLE_SUBJECT_COLUMN] ?? "",
        html: simpleLetterHtml(row[SIMPLE_BODY_COLUMN] ?? ""),
      }));

      for (const [index, message] of messages.entries()) {
        if (sendCancelRef.current) break;
        const canSend = await waitForWindow(schedule, () => sendCancelRef.current, setWaiting);
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
          pushAssistant("Limite diário atingido — parei o disparo por aqui.");
          break;
        }
        if ((index + 1) % 10 === 0) {
          const risk = await guard.checkRisk();
          if (risk.stop) {
            pushAssistant(risk.alerts[0]?.message ?? "Bounce/spam alto: parei o disparo.");
            break;
          }
        }
      }

      setProgress(100);
      void guard.refreshUsage();
      const okCount = sent.filter((r) => r.success).length;
      const finalStatus: CampaignStatus = okCount > 0 ? "concluido" : "erro";
      setStatus(finalStatus);
      await persist({
        status: finalStatus,
        results: sent,
        sent_count: okCount,
        finished_at: new Date().toISOString(),
      });
      pushAssistant(`Pronto: ${okCount} de ${sent.length} e-mails enviados.`);
    } catch (error) {
      setStatus("erro");
      await persist({ status: "erro", results: sent });
      pushAssistant(error instanceof Error ? error.message : "Falha no disparo.");
    } finally {
      setSending(false);
    }
  }

  // ---------- execução das ações da IA ----------

  async function runAction(action: ChatAction): Promise<string | null> {
    switch (action.tool) {
      case "set_sender": {
        const patch: Partial<SimpleBrief> = {};
        if (action.senderName) {
          setSenderName(action.senderName);
          patch.senderName = action.senderName;
        }
        if (action.senderRole) patch.senderRole = action.senderRole;
        if (action.senderEmail) setSenderEmail(action.senderEmail);
        if (Object.keys(patch).length > 0) setBrief((current) => ({ ...current, ...patch }));
        return null;
      }
      case "set_brief": {
        setBrief((current) => ({ ...current, proposal: action.proposal }));
        return null;
      }
      case "generate_emails": {
        if (latest.current.length === 0) return "Ainda não recebi o CSV com os contatos.";
        const nextBrief = { ...brief, proposal: brief.proposal };
        const ok = await generateAll(action.only_missing !== false, nextBrief);
        return `Escrevi ${ok} e-mail(s). Dá uma olhada no painel ao lado e me diz o que ajustar.`;
      }
      case "edit_email": {
        const target = action.email.trim().toLowerCase();
        let found = false;
        setRecipients(
          latest.current.map((row) => {
            if ((row["email"] ?? "").toLowerCase() !== target) return row;
            found = true;
            return {
              ...row,
              ...(action.subject ? { [SIMPLE_SUBJECT_COLUMN]: action.subject } : {}),
              ...(action.body ? { [SIMPLE_BODY_COLUMN]: action.body } : {}),
            };
          }),
        );
        return found ? null : `Não achei ${action.email} na lista.`;
      }
      case "regenerate_email": {
        const target = action.email.trim().toLowerCase();
        const index = latest.current.findIndex(
          (row) => (row["email"] ?? "").toLowerCase() === target,
        );
        if (index === -1) return `Não achei ${action.email} na lista.`;
        setGenerating(true);
        const ok = await generateOne(index);
        setGenerating(false);
        return ok ? null : `Não consegui reescrever o e-mail de ${action.email}.`;
      }
      case "send_test":
        return await runTest(action.email.trim());
      case "send_all": {
        if (latest.current.filter(isReady).length === 0) return "Ainda não há e-mails prontos.";
        setPendingSend(true);
        return null;
      }
      default:
        return null;
    }
  }

  async function submit(text: string) {
    const content = text.trim();
    if (!content || thinking || locked) return;
    if (!configured) {
      toast.error("Configure a base URL e a API key da IA em Configurações.");
      return;
    }

    const history: ChatMessage[] = [
      ...chat,
      { role: "user", content, at: new Date().toISOString() },
    ];
    setChat(history);
    setInput("");
    setThinking(true);

    try {
      const conversation = history
        .filter((m) => m.role !== "system")
        .map((m) => `${m.role === "user" ? "Operador" : "Você"}: ${m.content}`)
        .join("\n\n");
      const raw = await callAi(
        settings,
        `${snapshot()}\n\nCONVERSA ATÉ AQUI:\n${conversation}\n\nResponda ao último turno do operador.`,
        buildChatSystemPrompt(),
      );
      const turn = parseChatTurn(raw);
      pushAssistant(turn.message, {
        action: turn.action.tool,
        confirm: turn.action.tool === "send_all" ? "send_all" : null,
      });
      const note = await runAction(turn.action);
      if (note) pushAssistant(note);
    } catch (error) {
      pushAssistant(
        error instanceof Error ? `Deu erro na IA: ${error.message}` : "Deu erro ao falar com a IA.",
      );
    } finally {
      setThinking(false);
    }
  }

  async function handleCsv(file: File) {
    try {
      const { rows } = parseCsv(await file.text());
      setRecipients(rows);
      setChat((prev) => [
        ...prev,
        { role: "user", content: `📎 Enviei o CSV "${file.name}" com ${rows.length} contatos.` },
        {
          role: "assistant",
          content: `Recebi ${rows.length} contatos. ${
            brief.proposal.trim()
              ? "Posso escrever os e-mails agora — é só dizer."
              : "Agora me diz em uma frase qual é a proposta deste disparo."
          }`,
        },
      ]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível ler o CSV.");
    }
  }

  function updateRow(index: number, patch: Record<string, string>) {
    setRecipients(latest.current.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  return (
    <main className="mx-auto w-full max-w-[1200px] space-y-4 px-4 py-8">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/disparos">
              <ArrowLeft className="size-4" />
              Meus disparos
            </Link>
          </Button>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight">{campaign.name}</h1>
            <Badge variant="secondary">Puro IA</Badge>
            <Badge variant="outline">{STATUS_LABEL[status]}</Badge>
            {savedAt && <span className="text-muted-foreground text-xs">Salvo às {savedAt}</span>}
          </div>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link to="/configuracoes">
            <Settings2 className="size-4" />
            Configurações
          </Link>
        </Button>
      </header>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {/* ---------------- chat ---------------- */}
        <Card className="flex h-[70vh] flex-col">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Bot className="text-primary size-4" />
              Conversa
            </CardTitle>
            <CardDescription>
              Descreva o disparo, anexe o CSV e peça o que quiser: gerar, ajustar, testar, enviar.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex min-h-0 flex-1 flex-col gap-3">
            <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
              {chat.map((message, index) => (
                <div
                  key={index}
                  className={
                    message.role === "user"
                      ? "bg-primary text-primary-foreground ml-auto max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap"
                      : "bg-muted mr-auto max-w-[90%] rounded-lg px-3 py-2 text-sm"
                  }
                >
                  {message.role === "user" ? (
                    message.content
                  ) : (
                    <div className="prose prose-sm dark:prose-invert max-w-none [&_p]:my-1">
                      <ReactMarkdown>{message.content}</ReactMarkdown>
                    </div>
                  )}
                </div>
              ))}

              {(thinking || generating) && (
                <p className="text-muted-foreground flex items-center gap-2 text-xs">
                  <Loader2 className="size-3 animate-spin" />
                  {generating ? "Escrevendo os e-mails…" : "Pensando…"}
                </p>
              )}

              {pendingSend && (
                <div className="border-primary/40 bg-primary/5 space-y-2 rounded-lg border p-3 text-sm">
                  <p className="font-medium">Confirmar envio</p>
                  <p className="text-muted-foreground text-xs">
                    {readyCount} e-mails · remetente {senderName || "—"} &lt;{senderEmail || "—"}&gt; ·
                    restam {Math.max(guard.dailyLimit - guard.sentLast24h, 0)} envios hoje.
                  </p>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      disabled={sending || guard.limitReached}
                      onClick={() => {
                        setPendingSend(false);
                        void runSendAll();
                      }}
                    >
                      <Send className="size-4" />
                      Confirmar envio
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setPendingSend(false)}>
                      Cancelar
                    </Button>
                  </div>
                </div>
              )}

              {sending && <Progress value={progress} />}
            </div>

            <div className="space-y-2">
              <Textarea
                value={input}
                rows={2}
                disabled={locked}
                placeholder="Ex.: quero falar com 40 construtoras de Santos sobre o convênio, assina Rebeca (rh@cafcm.org.br)."
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void submit(input);
                  }
                }}
              />
              <div className="flex items-center gap-2">
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv,text/csv"
                  className="sr-only"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void handleCsv(file);
                    e.target.value = "";
                  }}
                />
                <Button
                  variant="outline"
                  size="sm"
                  disabled={locked}
                  onClick={() => fileRef.current?.click()}
                >
                  <Paperclip className="size-4" />
                  Anexar CSV
                </Button>
                <Button
                  size="sm"
                  disabled={thinking || locked || !input.trim()}
                  onClick={() => void submit(input)}
                >
                  {thinking ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                  Enviar
                </Button>
              </div>
              {!configured && (
                <p className="text-destructive text-xs">
                  IA não configurada — informe base URL e API key em Configurações.
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* ---------------- painel do disparo ---------------- */}
        <Card className="flex h-[70vh] flex-col">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <UserRound className="text-primary size-4" />
              Disparo montado
            </CardTitle>
            <CardDescription>
              {readyCount} de {recipients.length} e-mails escritos. Pode editar tudo aqui.
            </CardDescription>
          </CardHeader>
          <CardContent className="min-h-0 flex-1 space-y-3 overflow-y-auto">
            <div className="grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <p className="text-muted-foreground text-xs">Remetente</p>
                <p className="truncate">{senderName || "—"}</p>
                <p className="text-muted-foreground truncate text-xs">{senderEmail || "—"}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Assinatura</p>
                <p className="truncate">
                  {brief.senderName || "—"}
                  {brief.senderRole ? ` — ${brief.senderRole}` : ""}
                </p>
              </div>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Proposta</p>
              <p className="text-sm">{brief.proposal || "—"}</p>
            </div>

            <DailyLimitBanner
              dailyLimit={guard.dailyLimit}
              sentLast24h={guard.sentLast24h}
              nearLimit={guard.nearLimit}
              limitReached={guard.limitReached}
            />

            {recipients.length === 0 && (
              <p className="text-muted-foreground text-sm">
                Nenhum contato ainda — anexe o CSV pelo chat.
              </p>
            )}

            {recipients.map((row, index) => {
              const subject = row[SIMPLE_SUBJECT_COLUMN] ?? "";
              const warnings = promoSubjectWarnings(subject);
              return (
                <div key={`${row["email"]}-${index}`} className="space-y-2 rounded-lg border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{row["email"]}</p>
                      <p className="text-muted-foreground truncate text-xs">
                        {[row["nome"], row["empresa"], row["segmento"], row["categoria"]]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Badge variant={isReady(row) ? "default" : "secondary"}>
                        {isReady(row) ? "Pronto" : "Pendente"}
                      </Badge>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={locked || generating || !configured}
                        aria-label={`Regerar e-mail de ${row["email"]}`}
                        onClick={() => {
                          setGenerating(true);
                          void generateOne(index).finally(() => setGenerating(false));
                        }}
                      >
                        <RefreshCw className="size-4" />
                      </Button>
                    </div>
                  </div>
                  <Input
                    value={subject}
                    disabled={locked}
                    aria-label={`Assunto para ${row["email"]}`}
                    placeholder="Assunto"
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
                    rows={6}
                    aria-label={`Texto para ${row["email"]}`}
                    placeholder="Texto do e-mail"
                    onChange={(e) => updateRow(index, { [SIMPLE_BODY_COLUMN]: e.target.value })}
                  />
                </div>
              );
            })}

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
      </div>

      <DeliverabilityReport campaignId={campaign.id} />
    </main>
  );
}
