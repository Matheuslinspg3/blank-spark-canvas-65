import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft,
  FileText,
  Loader2,
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
import { sendSimpleEmailsFn } from "@/lib/send-email.functions";
import { defaultSender, loadSenders } from "@/lib/senders";
import {
  DEFAULT_SCHEDULE,
  sleep,
  waitForWindow,
  type SendSchedule,
} from "@/lib/send-schedule";
import {
  SAMPLE_TEMPLATE_BODY,
  TEMPLATE_ID_COLUMN,
  availableVariables,
  categoryOf,
  ensureTemplatesForRows,
  isRowReady,
  newTemplate,
  parseTemplatePlan,
  renderBody,
  renderSubject,
  renderTemplateHtml,
  resolveTemplate,
  serializeTemplatePlan,
  type MoldeTemplate,
} from "@/lib/template-dispatch";

export function TemplateDispatch({ campaign }: { campaign: Campaign }) {
  const save = useServerFn(updateCampaign);
  const sendSimple = useServerFn(sendSimpleEmailsFn);
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
      brief: planJson,
      sender_name: senderName,
      sender_email: senderEmail,
      recipients,
      total_count: recipients.length,
    });
    setSaving(false);
    toast.success("Rascunho salvo");
  }

  function patchTemplate(id: string, patch: Partial<MoldeTemplate>) {
    setTemplates((current) =>
      current.map((template) => (template.id === id ? { ...template, ...patch } : template)),
    );
  }

  function addTemplate() {
    const created = newTemplate(`Molde ${templates.length + 1}`);
    setTemplates((current) => [...current, created]);
    setActiveTab(created.id);
  }

  function removeTemplate(id: string) {
    setTemplates((current) => current.filter((template) => template.id !== id));
    setRecipients((current) =>
      current.map((row) => (row[TEMPLATE_ID_COLUMN] === id ? { ...row, [TEMPLATE_ID_COLUMN]: "" } : row)),
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
        i === index ? { ...row, [TEMPLATE_ID_COLUMN]: templateId === "auto" ? "" : templateId } : row,
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

  async function handleSend() {
    const messages = messagesFor(readyRows);
    if (messages.length === 0) {
      toast.error("Nenhum e-mail pronto para enviar.");
      return;
    }
    if (!senderEmail.trim()) {
      toast.error("Escolha o remetente verificado.");
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
            toast.error(risk.alerts[0]?.message ?? "Taxa de bounce/spam alta: disparo interrompido.");
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
          <Button size="sm" variant="outline" disabled={locked} onClick={addTemplate}>
            <Plus className="size-4" />
            Novo molde
          </Button>
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
                const sample = recipients.find(
                  (row) => resolveTemplate(row, templates)?.id === template.id,
                );
                const count = recipients.filter(
                  (row) => resolveTemplate(row, templates)?.id === template.id,
                ).length;
                const warnings = promoSubjectWarnings(template.subject);

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
                      <Label htmlFor={`assunto-${template.id}`}>Assunto</Label>
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
                      <Label htmlFor={`corpo-${template.id}`}>Texto do e-mail</Label>
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
                        rows={10}
                        placeholder={SAMPLE_TEMPLATE_BODY}
                        onChange={(event) =>
                          patchTemplate(template.id, { body: event.target.value })
                        }
                      />
                    </div>

                    <div className="bg-muted/40 space-y-2 rounded-lg border p-3">
                      <p className="text-muted-foreground text-xs font-medium uppercase">
                        Prévia {sample?.["email"] ? `· ${sample["email"]}` : "· exemplo"}
                      </p>
                      <p className="text-sm font-medium">
                        {renderSubject(template, sample ?? {}) || "(sem assunto)"}
                      </p>
                      <p className="text-sm whitespace-pre-wrap">
                        {renderBody(template, sample ?? {}) || "(sem texto)"}
                      </p>
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
          <CardDescription>1 e-mail por segundo. Só as empresas prontas são enviadas.</CardDescription>
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
          {waiting && (
            <p className="text-muted-foreground text-xs">
              Fora da janela de envio — aguardando {schedule.startTime} para continuar.
            </p>
          )}

          <Button
            disabled={locked || readyRows.length === 0 || guard.limitReached}
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
