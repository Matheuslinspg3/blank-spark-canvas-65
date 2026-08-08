import { Info, Save } from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { TEMPLATE_STORAGE_KEY, type EmailFormData } from "@/lib/bulk-email";

type EmailEditorProps = {
  formData: EmailFormData;
  columns: string[];
  disabled: boolean;
  onChange: (patch: Partial<EmailFormData>) => void;
};

export function EmailEditor({ formData, columns, disabled, onChange }: EmailEditorProps) {
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
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="senderName">Nome do remetente</Label>
          <Input
            id="senderName"
            value={formData.senderName}
            disabled={disabled}
            placeholder="Equipe Acme"
            onChange={(e) => onChange({ senderName: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="senderEmail">E-mail do remetente</Label>
          <Input
            id="senderEmail"
            type="email"
            value={formData.senderEmail}
            disabled={disabled}
            placeholder="contato@suaempresa.com"
            onChange={(e) => onChange({ senderEmail: e.target.value })}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="subject">Assunto</Label>
        <Input
          id="subject"
          value={formData.subject}
          disabled={disabled}
          placeholder="{{nome}}, temos uma novidade para a {{empresa}}"
          onChange={(e) => onChange({ subject: e.target.value })}
        />
      </div>

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
