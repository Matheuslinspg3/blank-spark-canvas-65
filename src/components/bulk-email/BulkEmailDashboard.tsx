import {
  AlertTriangle,
  ArrowLeft,
  Clock,
  Eye,
  FileText,
  Mail,
  Save,
  Send,
  Settings2,
  Sparkles,
  TestTube2,
  Upload,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { RecipientQueue } from "./RecipientQueue";
import { CSVUploader } from "./CSVUploader";
import { EmailEditor } from "./EmailEditor";
import { FinalReview } from "./FinalReview";
import { ResultsTable } from "./ResultsTable";
import { SenderFields } from "./SenderFields";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  buildReportCsv,
  DEFAULT_TEMPLATE,
  downloadFile,
  LARGE_BATCH_THRESHOLD,
  RATE_LIMIT_PER_SECOND,
  TEMPLATE_STORAGE_KEY,
  type EmailFormData,
  type Recipient,
  type Reviews,
  type SendResult,
} from "@/lib/bulk-email";
import { STATUS_LABEL, type Campaign, type CampaignPatch, type CampaignStatus } from "@/lib/campaigns";
import { updateCampaign } from "@/lib/campaigns.functions";
import { sendBulkEmails } from "@/lib/send-campaign";
import { sendTestEmailFn } from "@/lib/send-email.functions";
import { AI_COLUMN } from "@/lib/ai-config";

/** Numbered step wrapper used by every section of the dashboard. */
function Step({
  step,
  title,
  description,
  icon,
  active,
  children,
}: {
  step: number;
  title: string;
  description: string;
  icon: ReactNode;
  active: boolean;
  children: ReactNode;
}) {
  return (
    <Card className={active ? "border-primary/40 shadow-sm" : undefined}>
      <CardHeader>
        <div className="flex items-start gap-3">
          <div
            className={`flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
              active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
            }`}
          >
            {step}
          </div>
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2 text-base">
              {icon}
              {title}
            </CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export function BulkEmailDashboard({ campaign }: { campaign: Campaign }) {
  const save = useServerFn(updateCampaign);
  const sendTest = useServerFn(sendTestEmailFn);

  const [name, setName] = useState(campaign.name);
  const [status, setStatus] = useState<CampaignStatus>(campaign.status);
  const [recipients, setRecipients] = useState<Recipient[]>(campaign.recipients ?? []);
  const [csvColumns, setCsvColumns] = useState<string[]>(
    Object.keys((campaign.recipients ?? [])[0] ?? {}),
  );
  const [formData, setFormData] = useState<EmailFormData>({
    senderName: campaign.sender_name,
    senderEmail: campaign.sender_email,
    subject: campaign.subject,
    htmlTemplate: campaign.html_template || DEFAULT_TEMPLATE,
  });
  const [loading, setLoading] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<SendResult[]>(campaign.results ?? []);
  const [sentAt, setSentAt] = useState<string | null>(campaign.finished_at);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [reviews, setReviews] = useState<Reviews>(campaign.reviews ?? {});
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [testEmail, setTestEmail] = useState("");
  const [testing, setTesting] = useState(false);

  // Restore a previously saved template only for a brand-new draft.
  useEffect(() => {
    if (campaign.html_template) return;
    const saved = localStorage.getItem(TEMPLATE_STORAGE_KEY);
    if (saved) setFormData((prev) => ({ ...prev, htmlTemplate: saved }));
  }, [campaign.html_template]);

  // Pré-seleciona o remetente verificado padrão em disparos sem remetente.
  useEffect(() => {
    if (campaign.sender_email) return;
    const sender = defaultSender(loadSenders());
    if (sender) {
      setFormData((prev) => ({ ...prev, senderName: sender.name, senderEmail: sender.email }));
    }
  }, [campaign.sender_email]);



  const persist = useRef(async (patch: CampaignPatch) => {
    await save({ data: { id: campaign.id, patch } });
  });

  // Autosave the draft (debounced) whenever the user edits the job.
  useEffect(() => {
    if (loading) return;
    const timer = window.setTimeout(() => {
      void persist
        .current({
          name,
          sender_name: formData.senderName,
          sender_email: formData.senderEmail,
          subject: formData.subject,
          html_template: formData.htmlTemplate,
          recipients,
          reviews,
          total_count: recipients.length,
        })
        .then(() => setSavedAt(new Date()))
        .catch(() => undefined);
    }, 900);
    return () => window.clearTimeout(timer);
  }, [name, formData, recipients, reviews, loading]);

  const approvedRecipients = useMemo(
    () => recipients.filter((row) => reviews[row["email"] ?? ""]?.status === "aprovado"),
    [recipients, reviews],
  );

  const currentStep = useMemo(() => {
    if (results.length > 0) return 4;
    if (recipients.length === 0) return 1;
    if (!formData.subject.trim() || !formData.htmlTemplate.trim()) return 2;
    if (approvedRecipients.length === 0) return 3;
    return 4;
  }, [recipients.length, formData.subject, formData.htmlTemplate, results.length, approvedRecipients.length]);

  function updateForm(patch: Partial<EmailFormData>) {
    setFormData((prev) => ({ ...prev, ...patch }));
  }

  function validate(): string | null {
    if (recipients.length === 0) return "Carregue um CSV com a coluna 'email'.";
    if (!formData.subject.trim()) return "Informe o assunto do e-mail.";
    if (!formData.htmlTemplate.trim()) return "Informe o template HTML.";
    if (!formData.senderEmail.trim()) return "Informe o e-mail do remetente.";
    if (approvedRecipients.length === 0) return "Aprove ao menos um e-mail no passo 3.";
    return null;
  }

  function requestSend() {
    const error = validate();
    if (error) {
      toast.error(error);
      return;
    }
    setConfirmOpen(true);
  }

  /** Roda o envio de uma lista e devolve os resultados, com barra de progresso. */
  async function dispatch(list: Recipient[]): Promise<SendResult[]> {
    const expectedMs = (list.length / RATE_LIMIT_PER_SECOND) * 1000;
    setProgress(4);
    const ticker = window.setInterval(() => {
      setProgress((prev) => Math.min(prev + 100 / Math.max(expectedMs / 400, 1), 95));
    }, 400);
    try {
      return await sendBulkEmails({ recipients: list, ...formData });
    } finally {
      window.clearInterval(ticker);
      setProgress(100);
    }
  }

  async function handleSend() {
    setLoading(true);
    setResults([]);
    setStatus("enviando");
    await persist.current({
      status: "enviando",
      started_at: new Date().toISOString(),
      recipients,
      reviews,
      total_count: recipients.length,
      name,
      sender_name: formData.senderName,
      sender_email: formData.senderEmail,
      subject: formData.subject,
      html_template: formData.htmlTemplate,
    });

    try {
      const sendResults = await dispatch(approvedRecipients);
      setResults(sendResults);
      const ok = sendResults.filter((r) => r.success).length;
      const finalStatus: CampaignStatus = ok === 0 ? "erro" : "concluido";
      const finishedAt = new Date().toISOString();
      setStatus(finalStatus);
      setSentAt(finishedAt);
      await persist.current({
        status: finalStatus,
        results: sendResults,
        sent_count: ok,
        finished_at: finishedAt,
      });
      if (ok === sendResults.length) toast.success(`${ok} e-mails enviados com sucesso`);
      else if (ok === 0) toast.error("Nenhum e-mail pôde ser enviado. Verifique o relatório de falhas.");
      else toast.warning(`${ok} de ${sendResults.length} e-mails enviados`);
    } finally {
      setLoading(false);
    }
  }

  /** Reenvia apenas os e-mails que falharam e funde o resultado no log. */
  async function handleRetryFailed() {
    const failedEmails = new Set(results.filter((r) => !r.success).map((r) => r.email));
    const list = recipients.filter((row) => failedEmails.has(row["email"] ?? ""));
    if (list.length === 0) return;

    setRetrying(true);
    try {
      const retried = await dispatch(list);
      const byEmail = new Map(retried.map((r) => [r.email, r]));
      const merged = results.map((r) => byEmail.get(r.email) ?? r);
      setResults(merged);
      const ok = merged.filter((r) => r.success).length;
      const finishedAt = new Date().toISOString();
      const finalStatus: CampaignStatus = ok === 0 ? "erro" : "concluido";
      setStatus(finalStatus);
      setSentAt(finishedAt);
      await persist.current({
        status: finalStatus,
        results: merged,
        sent_count: ok,
        finished_at: finishedAt,
      });
      const recovered = retried.filter((r) => r.success).length;
      if (recovered > 0) toast.success(`${recovered} e-mails reenviados com sucesso`);
      else toast.error("As falhas persistiram no reenvio.");
    } finally {
      setRetrying(false);
    }
  }

  async function handleTestEmail() {
    const target = testEmail.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(target)) {
      toast.error("Informe um e-mail válido para o teste.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.senderEmail.trim())) {
      toast.error("Preencha o e-mail do remetente (o endereço que aparece como 'De:') antes do teste.");
      return;
    }
    const sample = approvedRecipients[0] ?? recipients[0];
    if (!sample) {
      toast.error("Carregue um CSV para gerar o e-mail de teste.");
      return;
    }

    setTesting(true);
    try {
      const result = await sendTest({ data: { to: target, recipient: sample, ...formData } });
      if (result.success) toast.success(`E-mail de teste enviado para ${target}`);
      else toast.error(result.error ?? "Não foi possível enviar o teste.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível enviar o teste.");
    } finally {
      setTesting(false);
    }
  }

  function exportReport() {
    downloadFile(
      `relatorio-disparo-${new Date().toISOString().slice(0, 10)}.csv`,
      buildReportCsv(recipients, reviews, results, sentAt),
    );
  }

  const rejectedCount = recipients.filter(
    (row) => reviews[row["email"] ?? ""]?.status === "rejeitado",
  ).length;

  return (
    <main className="mx-auto w-full max-w-[1200px] space-y-6 px-4 py-10">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-2">
          <Button asChild variant="ghost" size="sm" className="-ml-2">
            <Link to="/disparos">
              <ArrowLeft className="size-4" />
              Meus disparos
            </Link>
          </Button>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Mail className="text-primary size-6" />
            Disparo Tracker
          </h1>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={name}
              disabled={loading}
              onChange={(event) => setName(event.target.value)}
              className="h-9 max-w-xs"
              aria-label="Nome do disparo"
            />
            <Badge
              variant={
                status === "concluido" ? "default" : status === "erro" ? "destructive" : "secondary"
              }
            >
              {STATUS_LABEL[status]}
            </Badge>
            {savedAt && (
              <span className="text-muted-foreground inline-flex items-center gap-1 text-xs">
                <Save className="size-3.5" />
                Salvo às {savedAt.toLocaleTimeString("pt-BR")}
              </span>
            )}
          </div>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/configuracoes">
            <Settings2 className="size-4" />
            Configurar IA
          </Link>
        </Button>
      </header>

      <Step
        step={1}
        title="Upload do CSV"
        description="O arquivo precisa conter uma coluna chamada 'email'."
        icon={<Upload className="size-4" />}
        active={currentStep === 1}
      >
        <CSVUploader
          recipients={recipients}
          columns={csvColumns}
          disabled={loading}
          onLoaded={(columns, rows) => {
            setCsvColumns(columns);
            setRecipients(rows);
            setResults([]);
          }}
        />
      </Step>

      <Step
        step={2}
        title="Fila de e-mails e template"
        description="Escreva/gere o texto de cada destinatário e configure remetente, assunto e HTML."
        icon={<Sparkles className="size-4" />}
        active={recipients.length > 0 && currentStep === 2}
      >
        <Tabs defaultValue="fila">
          <TabsList>
            <TabsTrigger value="fila">
              <Sparkles className="size-4" />
              Fila
            </TabsTrigger>
            <TabsTrigger value="template">
              <FileText className="size-4" />
              Remetente e template
            </TabsTrigger>
          </TabsList>
          <TabsContent value="fila" className="pt-4">
            <RecipientQueue
              recipients={recipients}
              disabled={loading}
              onChange={(rows: Recipient[]) => {
                setRecipients(rows);
                setCsvColumns((prev) => (prev.includes(AI_COLUMN) ? prev : [...prev, AI_COLUMN]));
              }}
            />
          </TabsContent>
          <TabsContent value="template" className="pt-4">
            <EmailEditor
              formData={formData}
              columns={csvColumns}
              disabled={loading}
              onChange={updateForm}
            />
          </TabsContent>
        </Tabs>
      </Step>

      <Step
        step={3}
        title="Revisão de cada e-mail"
        description="Confira o assunto e o corpo, e aprove ou rejeite um a um. O status fica salvo no banco."
        icon={<Eye className="size-4" />}
        active={currentStep === 3}
      >
        <FinalReview
          recipients={recipients}
          formData={formData}
          reviews={reviews}
          disabled={loading}
          onReviewsChange={setReviews}
        />
      </Step>

      <Step
        step={4}
        title="Enviar"
        description="Teste antes, confirme e acompanhe as falhas com reenvio."
        icon={<Send className="size-4" />}
        active={currentStep === 4}
      >
        <div className="space-y-4">
          <div className="space-y-2 rounded-lg border p-3">
            <p className="flex items-center gap-2 text-sm font-medium">
              <TestTube2 className="size-4" />
              Enviar e-mail de teste
            </p>
            <p className="text-muted-foreground text-xs">
              Usa os dados do primeiro destinatário aprovado para montar o e-mail. O remetente é o
              endereço que aparece como "De:" — precisa ser um e-mail verificado na Brevo.
            </p>
            <SenderFields
              senderName={formData.senderName}
              senderEmail={formData.senderEmail}
              disabled={loading || testing}
              compact
              onChange={updateForm}
            />

            <div className="flex flex-wrap gap-2">
              <Input
                type="email"
                value={testEmail}
                placeholder="voce@empresa.com"
                className="h-9 max-w-xs"
                disabled={loading || testing}
                onChange={(event) => setTestEmail(event.target.value)}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={loading || testing}
                onClick={() => void handleTestEmail()}
              >
                <TestTube2 className="size-4" />
                {testing ? "Enviando teste…" : "Enviar teste"}
              </Button>
            </div>
          </div>

          {approvedRecipients.length > LARGE_BATCH_THRESHOLD && (
            <Alert>
              <AlertTriangle className="size-4" />
              <AlertTitle>Lote grande</AlertTitle>
              <AlertDescription>
                Você está prestes a enviar {approvedRecipients.length} e-mails de uma vez. Isso pode levar
                cerca de {Math.ceil(approvedRecipients.length / RATE_LIMIT_PER_SECOND / 60)} minutos e
                aumenta o risco de bloqueio por spam.
              </AlertDescription>
            </Alert>
          )}

          {(loading || retrying) && <Progress value={progress} />}

          <div className="flex flex-wrap items-center gap-3">
            <Button size="lg" className="min-w-56" disabled={loading} onClick={requestSend}>
              <Send className="size-4" />
              {loading ? "Enviando…" : `Enviar ${approvedRecipients.length} e-mails aprovados`}
            </Button>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="text-muted-foreground inline-flex cursor-help items-center gap-1.5 text-xs">
                  <Clock className="size-3.5" />
                  Rate limit
                </span>
              </TooltipTrigger>
              <TooltipContent>
                O envio é limitado a {RATE_LIMIT_PER_SECOND} e-mail por segundo para preservar a
                reputação do domínio.
              </TooltipContent>
            </Tooltip>
            {recipients.length > 0 && (
              <Button type="button" variant="ghost" size="sm" onClick={exportReport}>
                Exportar relatório CSV
              </Button>
            )}
          </div>

          {results.length > 0 && (
            <ResultsTable
              results={results}
              retrying={retrying}
              onRetryFailed={() => void handleRetryFailed()}
              onExportReport={exportReport}
            />
          )}
        </div>
      </Step>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar disparo</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-1 text-sm">
                <p>
                  Serão enviados <strong>{approvedRecipients.length}</strong> e-mails aprovados
                  {rejeitadosLabel(rejectedCount)}.
                </p>
                <p>
                  Remetente: <strong>{formData.senderName || "—"}</strong> &lt;{formData.senderEmail}&gt;
                </p>
                <p>
                  Assunto: <strong>{formData.subject}</strong>
                </p>
                <p className="text-muted-foreground">
                  Tempo estimado: ~
                  {Math.max(1, Math.ceil(approvedRecipients.length / RATE_LIMIT_PER_SECOND / 60))} min.
                  Esta ação não pode ser desfeita.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleSend()}>
              Confirmar e enviar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}

function rejeitadosLabel(count: number) {
  return count > 0 ? ` (${count} rejeitados serão ignorados)` : "";
}
