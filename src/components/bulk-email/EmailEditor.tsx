import { Info, Save, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  promoSubjectWarnings,
  TEMPLATE_STORAGE_KEY,
  type EmailFormData,
} from "@/lib/bulk-email";
import type { EmailVariant } from "@/lib/bulk-email";
import { SenderFields } from "./SenderFields";
import { SpamCheckPanel } from "./SpamCheckPanel";
import { TemplateGenerator } from "./TemplateGenerator";

type EmailEditorProps = {
  formData: EmailFormData;
  columns: string[];
  disabled: boolean;
  onChange: (patch: Partial<EmailFormData>) => void;
  onAbChange?: ((variants: EmailVariant[]) => void) | undefined;
};

export function EmailEditor({
  formData,
  columns,
  disabled,
  onChange,
  onAbChange,
}: EmailEditorProps) {
  const promoWarnings = promoSubjectWarnings(formData.subject);

  function saveTemplate() {
    try {
      localStorage.setItem(TEMPLATE_STORAGE_KEY, formData.htmlTemplate);
      toast.success("Template salvo neste navegador");
    } catch {
      toast.error("Não foi possível salvar o template");
    }
  }

  return (
    <div className="space-y-5">
      <SenderFields
        senderName={formData.senderName}
        senderEmail={formData.senderEmail}
        disabled={disabled}
        onChange={onChange}
      />


      <div className="space-y-2">
        <Label htmlFor="subject">Assunto</Label>
        <Input
          id="subject"
          value={formData.subject}
          disabled={disabled}
          placeholder="{{nome}}, uma ideia para a {{empresa}}"
          onChange={(e) => onChange({ subject: e.target.value })}
        />
        {promoWarnings.length > 0 && (
          <p className="text-muted-foreground flex items-start gap-1.5 text-xs">
            <TriangleAlert className="text-destructive mt-0.5 size-3 shrink-0" />
            Gatilhos de promoção no assunto ({promoWarnings.join(", ")}) — costumam empurrar o
            e-mail para a aba Promoções do Gmail.
          </p>
        )}
      </div>

      <TemplateGenerator
        disabled={disabled}
        defaultSignerName={formData.senderName}
        onAbChange={onAbChange}
        onGenerated={({ html, subject }) =>
          onChange({ htmlTemplate: html, ...(subject ? { subject } : {}) })
        }
      />


      <SpamCheckPanel
        subject={formData.subject}
        html={formData.htmlTemplate}
        disabled={disabled}
        onFixed={({ subject, html }) => onChange({ subject, htmlTemplate: html })}
      />

      <Alert>
        <Info className="size-4" />
        <AlertTitle>Variáveis dinâmicas</AlertTitle>
        <AlertDescription className="space-y-2">
          <p>
            Use <code className="font-mono">{"{{coluna}}"}</code> no assunto ou no HTML para
            personalizar cada envio — por exemplo{" "}
            <code className="font-mono">{"{{nome}}"}</code> ou{" "}
            <code className="font-mono">{"{{empresa}}"}</code>.
          </p>
          {columns.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {columns.map((column) => (
                <Badge key={column} variant="outline" className="font-mono text-xs">
                  {`{{${column}}}`}
                </Badge>
              ))}
            </div>
          )}
        </AlertDescription>
      </Alert>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="htmlTemplate">Template HTML</Label>
          <Button type="button" size="sm" variant="ghost" onClick={saveTemplate}>
            <Save className="size-4" />
            Salvar template
          </Button>
        </div>
        <Textarea
          id="htmlTemplate"
          value={formData.htmlTemplate}
          disabled={disabled}
          spellCheck={false}
          rows={18}
          className="bg-muted/40 font-mono text-xs leading-relaxed"
          onChange={(e) => onChange({ htmlTemplate: e.target.value })}
        />
      </div>
    </div>
  );
}
