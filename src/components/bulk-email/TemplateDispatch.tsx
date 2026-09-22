import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft,
  FileText,
  Loader2,
  Minimize2,
  Plus,
  Save,
  Send,
  Settings2,
  TestTube2,
  Trash2,
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
import { LinkCreatorDialog } from "./LinkCreatorDialog";

import { useSendGuard } from "@/hooks/use-send-guard";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  buildReportCsv,
  downloadFile,
  promoSubjectWarnings,
  type Recipient,
  type SendResult,
} from "@/lib/bulk-email";
import {
  STATUS_LABEL,
  type Campaign,
  type CampaignPatch,
  type CampaignStatus,
} from "@/lib/campaigns";
import { updateCampaign } from "@/lib/campaigns.functions";
import { cancelScheduleFn, scheduleCampaignFn } from "@/lib/schedule-dispatch.functions";
import { sendSimpleEmailsFn } from "@/lib/send-email.functions";
import { defaultSender, loadSenders } from "@/lib/senders";
import { DEFAULT_SCHEDULE, sleep, waitForWindow, type SendSchedule } from "@/lib/send-schedule";
import {
  SAMPLE_TEMPLATE_BODY,
  TEMPLATE_ID_COLUMN,
  TEMPLATE_PRESETS,
  availableVariables,
  bracketPlaceholders,
  categoryOf,
  ensureTemplatesForRows,
  hasVariantB,
  htmlSizeBytes,
  htmlSizeLevel,
  formatHtmlSize,
  GMAIL_SAFE_HTML_BYTES,
  indexInTemplate,
  isRowReady,
  newTemplate,
  optimizeEmailHtml,
  parseTemplatePlan,
  renderBody,
  renderSubject,
  renderTemplateHtml,
  resolveTemplate,
  serializeTemplatePlan,
  unfilledVariables,
  templateImages,
  replaceImageSrc,
  variantFor,
  type MoldeTemplate,
  type VariantLabel,
} from "@/lib/template-dispatch";

export function TemplateDispatch({ campaign }: { campaign: Campaign }) {
  const save = useServerFn(updateCampaign);
  const sendSimple = useServerFn(sendSimpleEmailsFn);
  const scheduleCampaign = useServerFn(scheduleCampaignFn);
  const cancelSchedule = useServerFn(cancelScheduleFn);
  const guard = useSendGuard(campaign.id);

  const [name, setName] = useState(campaign.name);
  const [status, setStatus] = useState<CampaignStatus>(campaign.status);
  const [senderName, setSenderName] = useState(campaign.sender_name);
  const [senderEmail, setSenderEmail] = useState(campaign.sender_email);
  const [templates, setTemplates] = useState<MoldeTemplate[]>(
    () => parseTemplatePlan(campaign.brief).templates,
  );
  const [activeTab, setActiveTab] = useState<string>("");
  const [recipients, setRecipients] = useState<Recipient[]>(campaign.recipients ?? []);
  const [csvColumns, setCsvColumns] = useState<string[]>(
    Object.keys((campaign.recipients ?? [])[0] ?? {}),
  );
  const [results, setResults] = useState<SendResult[]>(campaign.results ?? []);
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState(0);
  const [testEmail, setTestEmail] = useState("");
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [schedule, setSchedule] = useState<SendSchedule>(DEFAULT_SCHEDULE);
  const [waiting, setWaiting] = useState(false);
  const cancelRef = useRef(false);
  const [dirty, setDirty] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [optimizationSavings, setOptimizationSavings] = useState<Record<string, string>>({});

  const bodyRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});

  useEffect(() => {
    const sender = defaultSender(loadSenders());
    if (sender) {
      setSenderName((current) => current || sender.name);
      setSenderEmail((current) => current || sender.email);
    }
  }, []);

  useEffect(() => {
    if (templates.length > 0 && !templates.some((template) => template.id === activeTab)) {
      setActiveTab(templates[0]!.id);
    }
  }, [templates, activeTab]);

  const locked = sending || status === "enviando";
  const isScheduled = status === "agendado";
  const [scheduling, setScheduling] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const planJson = useMemo(() => serializeTemplatePlan({ templates }), [templates]);
  const readyRows = useMemo(
    () => recipients.filter((row) => isRowReady(row, templates)),
    [recipients, templates],
  );
  const variables = useMemo(() => availableVariables(csvColumns), [csvColumns]);

  /** Variação A/B de cada linha, dividida na ordem da lista. */
  const variantByRow = useMemo(() => {
    const map = new Map<Recipient, VariantLabel>();
    recipients.forEach((row, index) => {
      const template = resolveTemplate(row, templates);
      if (!template) return;
      map.set(row, variantFor(row, template, indexInTemplate(recipients, index, templates)));
    });
    return map;
  }, [recipients, templates]);

  function variantOf(row: Recipient): VariantLabel {
    return variantByRow.get(row) ?? "A";
  }

  const backupKey = `molde-draft:${campaign.id}`;

  // Backup local imediato: se a aba recarregar antes do autosave, nada se perde.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const saved = localStorage.getItem(backupKey);
      if (!saved) return;
      const parsed = parseTemplatePlan(saved).templates;
      if (parsed.length === 0) return;
      setTemplates((current) => {
        const json = serializeTemplatePlan({ templates: current });
        if (json === saved) return current;
        const currentFilled = current.filter((t) => t.subject.trim() || t.body.trim()).length;
        const savedFilled = parsed.filter((t) => t.subject.trim() || t.body.trim()).length;
        if (savedFilled <= currentFilled) return current;
        toast.info("Recuperamos os moldes que você estava escrevendo.");
        return parsed;
      });
    } catch {
      /* backup é opcional */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const firstRun = useRef(true);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Autosave: grava o rascunho ~1,5s depois da última alteração.
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    if (locked) return;
    try {
      localStorage.setItem(backupKey, planJson);
    } catch {
      /* ignore */
    }
    setDirty(true);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void (async () => {
        const ok = await persist(currentPatch());
        if (ok) {
          setDirty(false);
          setSavedAt(new Date());
        }
      })();
    }, 1500);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planJson, recipients, name, senderName, senderEmail]);

  // Avisa antes de fechar a aba com alterações ainda não salvas.
  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  async function persist(patch: CampaignPatch) {
    try {
      await save({ data: { id: campaign.id, patch } });
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar.");
      return false;
    }
  }

  const currentPatch = (): CampaignPatch => ({
    name,
    brief: planJson,
    sender_name: senderName,
    sender_email: senderEmail,
    recipients,
    total_count: recipients.length,
  });

  async function handleSave() {
    setSaving(true);
    const ok = await persist(currentPatch());
    setSaving(false);
    if (ok) {
      setDirty(false);
      setSavedAt(new Date());
      toast.success("Rascunho salvo");
    }
  }

  function patchTemplate(id: string, patch: Partial<MoldeTemplate>) {
    setTemplates((current) =>
      current.map((template) => (template.id === id ? { ...template, ...patch } : template)),
    );
  }

  function optimizeTemplate(template: MoldeTemplate) {
    const before = htmlSizeBytes(template.body) + htmlSizeBytes(template.bodyB ?? "");
    const body = optimizeEmailHtml(template.body);
    const bodyB = template.bodyB ? optimizeEmailHtml(template.bodyB) : template.bodyB;
    const after = htmlSizeBytes(body) + htmlSizeBytes(bodyB ?? "");
    const saved = Math.max(0, before - after);
    patchTemplate(template.id, bodyB === undefined ? { body } : { body, bodyB });
    const message =
      saved > 0
        ? `${formatHtmlSize(saved)} removidos · agora ${formatHtmlSize(after)}`
        : `Já está otimizado · ${formatHtmlSize(after)}`;
    setOptimizationSavings((current) => ({ ...current, [template.id]: message }));
    toast.success(message);
  }

  function addTemplate() {
    const created = newTemplate(`Molde ${templates.length + 1}`);
    setTemplates((current) => [...current, created]);
    setActiveTab(created.id);
  }

  function addPreset(preset: (typeof TEMPLATE_PRESETS)[number]) {
    const created = preset.build();
    setTemplates((current) => [...current, created]);
    setActiveTab(created.id);
    toast.success(`Molde "${created.name}" adicionado`);
  }

  function removeTemplate(id: string) {
    setTemplates((current) => current.filter((template) => template.id !== id));
    setRecipients((current) =>
      current.map((row) =>
        row[TEMPLATE_ID_COLUMN] === id ? { ...row, [TEMPLATE_ID_COLUMN]: "" } : row,
      ),
    );
  }

  function insertVariable(templateId: string, variable: string) {
    const textarea = bodyRefs.current[templateId];
    const template = templates.find((item) => item.id === templateId);
    if (!template) return;
    const token = `{{${variable}}}`;
    if (!textarea) {
      patchTemplate(templateId, { body: `${template.body}${token}` });
      return;
    }
    const start = textarea.selectionStart ?? template.body.length;
    const end = textarea.selectionEnd ?? start;
    const next = `${template.body.slice(0, start)}${token}${template.body.slice(end)}`;
    patchTemplate(templateId, { body: next });
    requestAnimationFrame(() => {
      textarea.focus();
      const caret = start + token.length;
      textarea.setSelectionRange(caret, caret);
    });
  }

  function assignTemplate(index: number, templateId: string) {
    setRecipients((current) =>
      current.map((row, i) =>
        i === index
          ? { ...row, [TEMPLATE_ID_COLUMN]: templateId === "auto" ? "" : templateId }
          : row,
      ),
    );
  }

  function messagesFor(rows: Recipient[]) {
    return rows.flatMap((row) => {
      const template = resolveTemplate(row, templates);
      if (!template) return [];
      const variant = variantOf(row);
      return [
        {
          email: row["email"] ?? "",
          subject: renderSubject(template, row, variant),
          html: renderTemplateHtml(template, row, variant),
        },
      ];
    });
  }

  async function handleTest() {
    const target = testEmail.trim();
    const sample = readyRows[0];
    if (!target) {
      toast.error("Informe um e-mail para o teste.");
      return;
    }
    if (!sample) {
      toast.error("Preencha ao menos um molde antes de testar.");
      return;
    }
    if (!senderEmail.trim()) {
      toast.error("Escolha o remetente verificado.");
      return;
    }

    const [message] = messagesFor([sample]);
    if (!message) return;
    if (htmlSizeBytes(message.html) >= GMAIL_SAFE_HTML_BYTES) {
      toast.error(
        "Este HTML está muito pesado. Otimize-o e troque imagens embutidas antes do teste.",
      );
      return;
    }

    setTesting(true);
    try {
      const [result] = await sendSimple({
        data: {
          senderName,
          senderEmail,
          messages: [{ ...message, email: target, subject: `[TESTE] ${message.subject}` }],
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

  async function handleSchedule() {
    setScheduling(true);
    try {
      await handleSend();
    } finally {
      setScheduling(false);
    }
  }

  async function handleCancelSchedule() {
    setCancelling(true);
    try {
      await cancelSchedule({ data: { campaignId: campaign.id } });
      setStatus("rascunho");
      toast.success("Agendamento cancelado.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao cancelar.");
    } finally {
      setCancelling(false);
    }
  }

  async function handleSend() {
    const messages = messagesFor(readyRows);
    if (messages.length === 0) {
      toast.error("Nenhum e-mail pronto para enviar.");
      return;
    }
    const oversized = messages.filter(
      (message) => htmlSizeBytes(message.html) >= GMAIL_SAFE_HTML_BYTES,
    );
    if (oversized.length > 0) {
      toast.error(
        `${oversized.length} e-mail(is) ultrapassam 90 KB. Otimize o HTML antes de enviar.`,
      );
      return;
    }
    if (!senderEmail.trim()) {
      toast.error("Escolha o remetente verificado.");
      return;
    }

    // Com agenda ligada, quem envia é o servidor: pode fechar a aba.
    if (schedule.enabled) {
      try {
        await scheduleCampaign({
          data: {
            campaignId: campaign.id,
            schedule,
            messages,
            senderName,
            senderEmail,
            recipients,
            brief: planJson,
          },
        });
        setStatus("agendado");
        setResults([]);
        toast.success(
          `${messages.length} e-mails programados. O envio continua no servidor, mesmo com o site fechado.`,
        );
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Falha ao programar o disparo.");
      }
      return;
    }

    cancelRef.current = false;
    setSending(true);
    setStatus("enviando");
    setProgress(0);
    await persist({
      status: "enviando",
      started_at: new Date().toISOString(),
      brief: planJson,
      recipients,
      sender_name: senderName,
      sender_email: senderEmail,
      total_count: recipients.length,
    });

    try {
      const sent: SendResult[] = [];
      for (const [index, message] of messages.entries()) {
        const canSend = await waitForWindow(schedule, () => cancelRef.current, setWaiting);
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
        if ((index + 1) % 10 === 0) {
          const risk = await guard.checkRisk();
          if (risk.stop) {
            toast.error(
              risk.alerts[0]?.message ?? "Taxa de bounce/spam alta: disparo interrompido.",
            );
            break;
          }
        }
      }
      setWaiting(false);
      setProgress(100);
      void guard.refreshUsage();
      const okCount = sent.filter((result) => result.success).length;
      const skipped = sent.filter((result) => result.blocked === "suppressed").length;
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

  const missingCount = recipients.length - readyRows.length;
  const oversizedCount = messagesFor(readyRows).filter(
    (message) => htmlSizeBytes(message.html) >= GMAIL_SAFE_HTML_BYTES,
  ).length;

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
              onChange={(event) => setName(event.target.value)}
            />
            <Badge variant="secondary">Molde</Badge>
            <Badge variant="outline">{STATUS_LABEL[status]}</Badge>
          </div>
        </div>
        <div className="flex gap-2">
          <LinkCreatorDialog />
          <Button variant="outline" size="sm" asChild>
            <Link to="/configuracoes">
              <Settings2 className="size-4" />
              Configurações
            </Link>
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={saving || locked}
            onClick={() => void handleSave()}
          >
            <Save className="size-4" />
            Salvar rascunho
          </Button>
          <span className="text-muted-foreground text-xs">
            {saving || dirty
              ? "Salvando…"
              : savedAt
                ? `Salvo ${savedAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`
                : "Salvo"}
          </span>
        </div>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <UserRound className="text-primary size-4" />
            Quem envia
          </CardTitle>
          <CardDescription>Use um remetente verificado na Brevo.</CardDescription>
        </CardHeader>
        <CardContent>
          <SenderFields
            senderName={senderName}
            senderEmail={senderEmail}
            disabled={locked}
            onChange={(patch) => {
              if (patch.senderName !== undefined) setSenderName(patch.senderName);
              if (patch.senderEmail !== undefined) setSenderEmail(patch.senderEmail);
            }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Upload className="text-primary size-4" />
            Lista de contatos
          </CardTitle>
          <CardDescription>
            CSV com a coluna email. Se houver coluna categoria (ou segmento), cria-se um molde por
            categoria automaticamente.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CSVUploader
            recipients={recipients}
            columns={csvColumns}
            disabled={locked}
            onLoaded={(cols, rows) => {
              const nextTemplates = ensureTemplatesForRows(rows, templates);
              setCsvColumns(cols);
              setRecipients(rows);
              setTemplates(nextTemplates);
              void persist({
                recipients: rows,
                total_count: rows.length,
                brief: serializeTemplatePlan({ templates: nextTemplates }),
              });
            }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
          <div className="space-y-1.5">
            <CardTitle className="flex items-center gap-2 text-base">
              <FileText className="text-primary size-4" />
              Moldes por categoria
            </CardTitle>
            <CardDescription>
              Escreva assunto e texto de cada molde. Use variáveis como {"{{nome}}"} e{" "}
              {"{{empresa}}"}.
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            {TEMPLATE_PRESETS.map((preset) => (
              <Button
                key={preset.label}
                size="sm"
                variant="ghost"
                disabled={locked}
                onClick={() => addPreset(preset)}
              >
                <FileText className="size-4" />
                {preset.label}
              </Button>
            ))}
            <Button size="sm" variant="outline" disabled={locked} onClick={addTemplate}>
              <Plus className="size-4" />
              Novo molde
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {templates.length === 0 && (
            <p className="text-muted-foreground text-sm">
              Carregue o CSV ou crie um molde para começar.
            </p>
          )}

          {templates.length > 0 && (
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="flex h-auto flex-wrap justify-start">
                {templates.map((template) => (
                  <TabsTrigger key={template.id} value={template.id}>
                    {template.name || "Sem nome"}
                  </TabsTrigger>
                ))}
              </TabsList>

              {templates.map((template) => {
                const sample =
                  recipients.find((row) => resolveTemplate(row, templates)?.id === template.id) ??
                  recipients[0];
                const count = recipients.filter(
                  (row) => resolveTemplate(row, templates)?.id === template.id,
                ).length;
                const warnings = promoSubjectWarnings(template.subject);
                const brackets = bracketPlaceholders(
                  template.subject,
                  template.body,
                  template.previewText ?? "",
                  template.subjectB ?? "",
                  template.bodyB ?? "",
                  template.previewTextB ?? "",
                );
                const missingVars = unfilledVariables(
                  [
                    template.subject,
                    template.body,
                    template.previewText ?? "",
                    template.subjectB ?? "",
                    template.bodyB ?? "",
                    template.previewTextB ?? "",
                  ],
                  sample,
                );
                const renderedA = renderTemplateHtml(template, sample ?? {}, "A");
                const renderedB = hasVariantB(template)
                  ? renderTemplateHtml(template, sample ?? {}, "B")
                  : "";
                const sizes = [
                  {
                    variant: "A",
                    bytes: htmlSizeBytes(renderedA),
                    level: htmlSizeLevel(renderedA),
                  },
                  ...(renderedB
                    ? [
                        {
                          variant: "B",
                          bytes: htmlSizeBytes(renderedB),
                          level: htmlSizeLevel(renderedB),
                        },
                      ]
                    : []),
                ];
                const hasBlockedSize = sizes.some((size) => size.level === "blocked");

                return (
                  <TabsContent key={template.id} value={template.id} className="space-y-4 pt-4">
                    <div className="flex flex-wrap items-end gap-3">
                      <div className="min-w-[220px] flex-1 space-y-1.5">
                        <Label htmlFor={`nome-${template.id}`}>Categoria / nome do molde</Label>
                        <Input
                          id={`nome-${template.id}`}
                          value={template.name}
                          disabled={locked}
                          placeholder="Construtora"
                          onChange={(event) =>
                            patchTemplate(template.id, { name: event.target.value })
                          }
                        />
                      </div>
                      <Badge variant="secondary">{count} empresas</Badge>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={locked}
                        onClick={() => removeTemplate(template.id)}
                      >
                        <Trash2 className="size-4" />
                        Excluir
                      </Button>
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor={`assunto-${template.id}`}>
                        Assunto {template.ab && "(A)"}
                      </Label>
                      <Input
                        id={`assunto-${template.id}`}
                        value={template.subject}
                        disabled={locked}
                        placeholder="Aprendizes para a {{empresa}}"
                        onChange={(event) =>
                          patchTemplate(template.id, { subject: event.target.value })
                        }
                      />
                      {warnings.length > 0 && (
                        <p className="text-destructive text-xs">
                          Risco de Promoções no assunto: {warnings.join(", ")}
                        </p>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor={`preview-${template.id}`}>
                        Preview text {template.ab && "(A)"}
                      </Label>
                      <Input
                        id={`preview-${template.id}`}
                        value={template.previewText ?? ""}
                        disabled={locked}
                        placeholder="Linha cinza que aparece ao lado do assunto na caixa de entrada"
                        onChange={(event) =>
                          patchTemplate(template.id, { previewText: event.target.value })
                        }
                      />
                    </div>

                    <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
                      <div>
                        <Label htmlFor={`html-${template.id}`}>HTML próprio</Label>
                        <p className="text-muted-foreground text-xs">
                          Cole um e-mail em HTML completo — as variáveis continuam funcionando.
                        </p>
                      </div>
                      <Switch
                        id={`html-${template.id}`}
                        checked={Boolean(template.html)}
                        disabled={locked}
                        onCheckedChange={(checked: boolean) =>
                          patchTemplate(template.id, { html: checked })
                        }
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor={`corpo-${template.id}`}>
                        {template.html ? "HTML do e-mail" : "Texto do e-mail"}{" "}
                        {template.ab && "(A)"}
                      </Label>
                      <div className="flex flex-wrap gap-1.5">
                        {variables.map((variable) => (
                          <Button
                            key={variable}
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-xs"
                            disabled={locked}
                            onClick={() => insertVariable(template.id, variable)}
                          >
                            {`{{${variable}}}`}
                          </Button>
                        ))}
                      </div>
                      <Textarea
                        id={`corpo-${template.id}`}
                        ref={(element) => {
                          bodyRefs.current[template.id] = element;
                        }}
                        value={template.body}
                        disabled={locked}
                        rows={template.html ? 18 : 10}
                        className={
                          template.html
                            ? "bg-muted/40 font-mono text-xs leading-relaxed"
                            : undefined
                        }
                        placeholder={
                          template.html
                            ? "<!doctype html> … cole aqui o HTML completo do e-mail"
                            : SAMPLE_TEMPLATE_BODY
                        }
                        onChange={(event) =>
                          patchTemplate(template.id, { body: event.target.value })
                        }
                      />
                    </div>

                    <div className="space-y-3 rounded-lg border p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <Label htmlFor={`ab-${template.id}`}>Teste A/B</Label>
                          <p className="text-muted-foreground text-xs">
                            Metade das empresas deste molde recebe a variação B.
                          </p>
                        </div>
                        <Switch
                          id={`ab-${template.id}`}
                          checked={Boolean(template.ab)}
                          disabled={locked}
                          onCheckedChange={(checked: boolean) =>
                            patchTemplate(template.id, { ab: checked })
                          }
                        />
                      </div>

                      {template.ab && (
                        <div className="space-y-3 border-t pt-3">
                          <div className="space-y-1.5">
                            <Label htmlFor={`assuntoB-${template.id}`}>Assunto (B)</Label>
                            <Input
                              id={`assuntoB-${template.id}`}
                              value={template.subjectB ?? ""}
                              disabled={locked}
                              onChange={(event) =>
                                patchTemplate(template.id, { subjectB: event.target.value })
                              }
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label htmlFor={`previewB-${template.id}`}>Preview text (B)</Label>
                            <Input
                              id={`previewB-${template.id}`}
                              value={template.previewTextB ?? ""}
                              disabled={locked}
                              onChange={(event) =>
                                patchTemplate(template.id, { previewTextB: event.target.value })
                              }
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label htmlFor={`corpoB-${template.id}`}>Texto do e-mail (B)</Label>
                            <Textarea
                              id={`corpoB-${template.id}`}
                              value={template.bodyB ?? ""}
                              disabled={locked}
                              rows={template.html ? 18 : 10}
                              className={
                                template.html
                                  ? "bg-muted/40 font-mono text-xs leading-relaxed"
                                  : undefined
                              }
                              placeholder={
                                template.html
                                  ? "<!doctype html> … HTML completo da variação B"
                                  : SAMPLE_TEMPLATE_BODY
                              }
                              onChange={(event) =>
                                patchTemplate(template.id, { bodyB: event.target.value })
                              }
                            />
                          </div>
                          {!hasVariantB(template) && (
                            <p className="text-muted-foreground text-xs">
                              Preencha assunto e texto da variação B — enquanto estiver vazia, todos
                              recebem a variação A.
                            </p>
                          )}
                        </div>
                      )}
                    </div>

                    {brackets.length > 0 && (
                      <Alert variant="destructive">
                        <AlertTitle>Campos entre colchetes não preenchidos</AlertTitle>
                        <AlertDescription>
                          {brackets.join(", ")} seriam enviados literalmente. Substitua pelo texto
                          real ou por uma variável {"{{coluna}}"}.
                        </AlertDescription>
                      </Alert>
                    )}

                    {template.html &&
                      (() => {
                        const images = templateImages(`${template.body}\n${template.bodyB ?? ""}`);
                        if (images.length === 0) return null;
                        const broken = images.filter((image) => image.problem);
                        return (
                          <div className="space-y-2 rounded-lg border p-3">
                            <p className="text-sm font-medium">
                              Imagens do e-mail ({images.length})
                              {broken.length > 0 && (
                                <span className="text-destructive">
                                  {" "}
                                  — {broken.length} precisam de endereço real
                                </span>
                              )}
                            </p>
                            {images.map((image) => (
                              <div
                                key={image.src}
                                className="space-y-1 border-t pt-2 first:border-t-0 first:pt-0"
                              >
                                <p className="text-muted-foreground truncate text-xs">
                                  {image.alt ? `${image.alt} · ` : ""}
                                  {image.src || "(sem endereço)"}
                                </p>
                                <Input
                                  defaultValue={image.src}
                                  disabled={locked}
                                  placeholder="https://… endereço público da imagem"
                                  onBlur={(event) => {
                                    const next = event.target.value.trim();
                                    if (!next || next === image.src) return;
                                    patchTemplate(template.id, {
                                      body: replaceImageSrc(template.body, image.src, next),
                                      bodyB: replaceImageSrc(template.bodyB ?? "", image.src, next),
                                    });
                                  }}
                                />
                                {image.problem && (
                                  <p className="text-destructive text-xs">{image.problem}</p>
                                )}
                              </div>
                            ))}
                            <p className="text-muted-foreground text-xs">
                              A imagem precisa estar publicada na internet (endereço https que abre
                              no navegador). Cole aqui o endereço certo e ele é trocado no HTML.
                            </p>
                          </div>
                        );
                      })()}

                    {template.html && (
                      <div className="space-y-3 rounded-lg border p-3">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="space-y-1">
                            <p className="text-sm font-medium">Peso do HTML final</p>
                            <div className="flex flex-wrap gap-2">
                              {sizes.map((size) => (
                                <Badge
                                  key={size.variant}
                                  variant={size.level === "blocked" ? "destructive" : "outline"}
                                >
                                  {hasVariantB(template) ? `${size.variant}: ` : ""}
                                  {formatHtmlSize(size.bytes)} ·{" "}
                                  {size.level === "safe"
                                    ? "Seguro"
                                    : size.level === "warning"
                                      ? "Atenção"
                                      : "Muito pesado"}
                                </Badge>
                              ))}
                            </div>
                          </div>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={locked}
                            onClick={() => optimizeTemplate(template)}
                          >
                            <Minimize2 className="size-4" />
                            Otimizar HTML
                          </Button>
                        </div>
                        {optimizationSavings[template.id] && (
                          <p className="text-muted-foreground text-xs">
                            {optimizationSavings[template.id]}
                          </p>
                        )}
                        {hasBlockedSize ? (
                          <Alert variant="destructive">
                            <AlertTitle>Envio bloqueado para evitar corte no Gmail</AlertTitle>
                            <AlertDescription>
                              Reduza para menos de 90 KB. Clique em Otimizar HTML e substitua
                              imagens embutidas por endereços https.
                            </AlertDescription>
                          </Alert>
                        ) : (
                          <p className="text-muted-foreground text-xs">
                            Limite preventivo: 90 KB. O Gmail costuma cortar perto de 102 KB.
                          </p>
                        )}
                      </div>
                    )}

                    {template.html && missingVars.length > 0 && (
                      <Alert>
                        <AlertTitle>Variáveis sem valor no CSV</AlertTitle>
                        <AlertDescription>
                          Para o exemplo, estas variáveis ficariam em branco:{" "}
                          {missingVars.join(", ")}. Confira se o CSV tem as colunas (ex.:
                          nome_responsavel, link_whatsapp, link_descadastro) — sem elas, o link ou a
                          saudação sai vazio.
                        </AlertDescription>
                      </Alert>
                    )}

                    <div className="bg-muted/40 space-y-3 rounded-lg border p-3">
                      <p className="text-muted-foreground text-xs font-medium uppercase">
                        Prévia {sample?.["email"] ? `· ${sample["email"]}` : "· exemplo"}
                      </p>
                      {(hasVariantB(template)
                        ? (["A", "B"] as VariantLabel[])
                        : (["A"] as VariantLabel[])
                      ).map((variant) => (
                        <div key={variant} className="space-y-1">
                          {hasVariantB(template) && (
                            <Badge variant="outline">Variação {variant}</Badge>
                          )}
                          <p className="text-sm font-medium">
                            {renderSubject(template, sample ?? {}, variant) || "(sem assunto)"}
                          </p>
                          <p className="text-muted-foreground text-xs">
                            {(variant === "A" ? template.previewText : template.previewTextB) ||
                              "(sem preview text)"}
                          </p>
                          {template.html ? (
                            <iframe
                              title={`Prévia ${variant}`}
                              sandbox=""
                              srcDoc={renderTemplateHtml(template, sample ?? {}, variant)}
                              className="h-[420px] w-full rounded-md border bg-white"
                            />
                          ) : (
                            <p className="text-sm whitespace-pre-wrap">
                              {renderBody(template, sample ?? {}, variant) || "(sem texto)"}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </TabsContent>
                );
              })}
            </Tabs>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Empresas e moldes</CardTitle>
          <CardDescription>
            {readyRows.length} de {recipients.length} prontas. Troque o molde de qualquer empresa.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {missingCount > 0 && recipients.length > 0 && (
            <Alert variant="destructive">
              <AlertTitle>{missingCount} empresas sem molde preenchido</AlertTitle>
              <AlertDescription>
                Elas não serão enviadas. Escolha um molde e preencha assunto e texto.
              </AlertDescription>
            </Alert>
          )}

          {recipients.map((row, index) => {
            const template = resolveTemplate(row, templates);
            const ready = isRowReady(row, templates);
            return (
              <div
                key={`${row["email"]}-${index}`}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{row["email"]}</p>
                  <p className="text-muted-foreground truncate text-xs">
                    {[row["nome"], row["empresa"], categoryOf(row)].filter(Boolean).join(" · ") ||
                      "sem categoria"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {template && hasVariantB(template) && (
                    <Badge variant="outline">Variação {variantOf(row)}</Badge>
                  )}
                  <Badge variant={ready ? "default" : "secondary"}>
                    {ready ? "Pronto" : template ? "Molde vazio" : "Sem molde"}
                  </Badge>
                  <Select
                    value={row[TEMPLATE_ID_COLUMN] || "auto"}
                    disabled={locked || templates.length === 0}
                    onValueChange={(value) => assignTemplate(index, value)}
                  >
                    <SelectTrigger className="h-9 w-[200px]">
                      <SelectValue placeholder="Molde" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">
                        Automático{template ? ` (${template.name})` : ""}
                      </SelectItem>
                      {templates.map((item) => (
                        <SelectItem key={item.id} value={item.id}>
                          {item.name || "Sem nome"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            );
          })}

          {recipients.length === 0 && (
            <p className="text-muted-foreground text-sm">Carregue o CSV para montar a lista.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Send className="text-primary size-4" />
            Enviar
          </CardTitle>
          <CardDescription>
            1 e-mail por segundo. Só as empresas prontas são enviadas.
          </CardDescription>
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
              onChange={(event) => setTestEmail(event.target.value)}
            />
            <Button
              variant="outline"
              size="sm"
              disabled={locked || testing}
              onClick={() => void handleTest()}
            >
              <TestTube2 className="size-4" />
              {testing ? "Enviando…" : "Enviar teste"}
            </Button>
          </div>

          <ScheduleFields
            schedule={schedule}
            pending={readyRows.length}
            contentToCheck={messagesFor(readyRows).map((message) => message.html)}
            disabled={locked || oversizedCount > 0}
            onChange={setSchedule}
            onSchedule={() => void handleSchedule()}
            scheduling={scheduling}
            scheduled={isScheduled}
            nextSendAt={campaign.next_send_at}
            onCancelSchedule={() => void handleCancelSchedule()}
            cancelling={cancelling}
          />

          <DailyLimitBanner
            dailyLimit={guard.dailyLimit}
            sentLast24h={guard.sentLast24h}
            nearLimit={guard.nearLimit}
            limitReached={guard.limitReached}
          />

          {oversizedCount > 0 && (
            <Alert variant="destructive">
              <AlertTitle>Envio bloqueado: HTML acima de 90 KB</AlertTitle>
              <AlertDescription>
                {oversizedCount} e-mail(is) seriam cortados pelo Gmail. Abra o molde correspondente,
                clique em Otimizar HTML e substitua imagens embutidas por links https.
              </AlertDescription>
            </Alert>
          )}

          {sending && <Progress value={progress} />}
          {waiting && (
            <p className="text-muted-foreground text-xs">
              Fora da janela de envio — aguardando {schedule.startTime} para continuar.
            </p>
          )}

          <Button
            disabled={
              locked ||
              readyRows.length === 0 ||
              guard.limitReached ||
              oversizedCount > 0 ||
              schedule.enabled ||
              isScheduled
            }
            onClick={() => void handleSend()}
          >
            {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            {sending ? "Enviando…" : `Enviar ${readyRows.length} e-mails`}
          </Button>
          {sending && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                cancelRef.current = true;
                setWaiting(false);
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
