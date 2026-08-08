import { AlertTriangle, ArrowLeft, Clock, Eye, FileText, Mail, Save, Send, Settings2, Sparkles, Upload } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { AiPersonalizer } from "./AiPersonalizer";
import { CSVUploader } from "./CSVUploader";
import { EmailEditor } from "./EmailEditor";
import { EmailPreview } from "./EmailPreview";
import { ResultsTable } from "./ResultsTable";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DEFAULT_TEMPLATE,
  LARGE_BATCH_THRESHOLD,
  RATE_LIMIT_PER_SECOND,
  TEMPLATE_STORAGE_KEY,
  type EmailFormData,
  type Recipient,
  type SendResult,
} from "@/lib/bulk-email";
import { STATUS_LABEL, type Campaign, type CampaignPatch, type CampaignStatus } from "@/lib/campaigns";
import { updateCampaign } from "@/lib/campaigns.functions";
import { sendBulkEmails } from "@/lib/send-campaign";
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
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<SendResult[]>(campaign.results ?? []);
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  // Restore a previously saved template only for a brand-new draft.
  useEffect(() => {
    if (campaign.html_template) return;
    const saved = localStorage.getItem(TEMPLATE_STORAGE_KEY);
    if (saved) setFormData((prev) => ({ ...prev, htmlTemplate: saved }));
  }, [campaign.html_template]);

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
          total_count: recipients.length,
        })
        .then(() => setSavedAt(new Date()))
        .catch(() => undefined);
    }, 900);
    return () => window.clearTimeout(timer);
  }, [name, formData, recipients, loading]);

  const currentStep = useMemo(() => {
    if (results.length > 0) return 4;
    if (recipients.length === 0) return 1;
    if (!formData.subject.trim() || !formData.htmlTemplate.trim()) return 2;
    return 3;
  }, [recipients.length, formData.subject, formData.htmlTemplate, results.length]);

  function updateForm(patch: Partial<EmailFormData>) {
    setFormData((prev) => ({ ...prev, ...patch }));
  }

  function validate(): string | null {
    if (recipients.length === 0) return "Carregue um CSV com a coluna 'email'.";
    if (!formData.subject.trim()) return "Informe o assunto do e-mail.";
    if (!formData.htmlTemplate.trim()) return "Informe o template HTML.";
    if (!formData.senderEmail.trim()) return "Informe o e-mail do remetente.";
    return null;
  }

  async function handleSend() {
    const error = validate();
    if (error) {
      toast.error(error);
      return;
    }

    setLoading(true);
    setResults([]);
    setProgress(4);
    setStatus("enviando");
    await persist.current({
      status: "enviando",
      started_at: new Date().toISOString(),
      recipients,
      total_count: recipients.length,
      name,
      sender_name: formData.senderName,
      sender_email: formData.senderEmail,
      subject: formData.subject,
      html_template: formData.htmlTemplate,
    });

    // Optimistic progress bar: the backend throttles to 1 email/second.
    const expectedMs = (recipients.length / RATE_LIMIT_PER_SECOND) * 1000;
    const ticker = window.setInterval(() => {
      setProgress((prev) => Math.min(prev + 100 / Math.max(expectedMs / 400, 1), 95));
    }, 400);

    try {
      const sendResults = await sendBulkEmails({ recipients, ...formData });
      setResults(sendResults);
      const ok = sendResults.filter((r) => r.success).length;
      const finalStatus: CampaignStatus = ok === 0 ? "erro" : "concluido";
      setStatus(finalStatus);
      await persist.current({
        status: finalStatus,
        results: sendResults,
        sent_count: ok,
        finished_at: new Date().toISOString(),
      });
      if (ok === sendResults.length) toast.success(`${ok} e-mails enviados com sucesso`);
      else if (ok === 0) toast.error("Nenhum e-mail pôde ser enviado. Verifique o log.");
      else toast.warning(`${ok} de ${sendResults.length} e-mails enviados`);
    } finally {
      window.clearInterval(ticker);
      setProgress(100);
      setLoading(false);
    }
  }

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
        title="Personalização com IA (opcional)"
        description="A IA pesquisa cada destinatário e escreve um trecho sob medida."
        icon={<Sparkles className="size-4" />}
        active={false}
      >
        <AiPersonalizer
          recipients={recipients}
          disabled={loading}
          onGenerated={(rows) => {
            setRecipients(rows);
            setCsvColumns((prev) => (prev.includes(AI_COLUMN) ? prev : [...prev, AI_COLUMN]));
          }}
        />
      </Step>

      <Step
        step={3}
        title="Configure o e-mail"
        description="Remetente, assunto e template HTML com variáveis."
        icon={<FileText className="size-4" />}
        active={currentStep === 2}
      >
        <Tabs defaultValue="editor">
          <TabsList>
            <TabsTrigger value="editor">
              <FileText className="size-4" />
              Editor
            </TabsTrigger>
            <TabsTrigger value="preview">
              <Eye className="size-4" />
              Preview
            </TabsTrigger>
          </TabsList>
          <TabsContent value="editor" className="pt-4">
            <EmailEditor
              formData={formData}
              columns={csvColumns}
              disabled={loading}
              onChange={updateForm}
            />
          </TabsContent>
          <TabsContent value="preview" className="pt-4">
            <EmailPreview formData={formData} recipient={recipients[0]} />
          </TabsContent>
        </Tabs>
      </Step>

      <Step
        step={4}
        title="Preview personalizado"
        description="Como o primeiro destinatário vai receber a mensagem."
        icon={<Eye className="size-4" />}
        active={currentStep === 3}
      >
        <EmailPreview formData={formData} recipient={recipients[0]} />
      </Step>

      <Step
        step={5}
        title="Enviar"
        description="O envio respeita o limite de 1 e-mail por segundo."
        icon={<Send className="size-4" />}
        active={currentStep === 4}
      >
        <div className="space-y-4">
          {recipients.length > LARGE_BATCH_THRESHOLD && (
            <Alert>
              <AlertTriangle className="size-4" />
              <AlertTitle>Lote grande</AlertTitle>
              <AlertDescription>
                Você está prestes a enviar {recipients.length} e-mails de uma vez. Isso pode levar
                cerca de {Math.ceil(recipients.length / RATE_LIMIT_PER_SECOND / 60)} minutos e
                aumenta o risco de bloqueio por spam.
              </AlertDescription>
            </Alert>
          )}

          {loading && <Progress value={progress} />}

          <div className="flex flex-wrap items-center gap-3">
            <Button size="lg" className="min-w-56" disabled={loading} onClick={() => void handleSend()}>
              <Send className="size-4" />
              {loading ? "Enviando…" : `Enviar ${recipients.length} e-mails`}
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
          </div>

          {results.length > 0 && <ResultsTable results={results} />}
        </div>
      </Step>
    </main>
  );
}
