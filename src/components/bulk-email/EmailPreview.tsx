import { Code2, Eye } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { interpolate, renderEmailHtml, type EmailFormData, type Recipient } from "@/lib/bulk-email";

type EmailPreviewProps = {
  formData: EmailFormData;
  recipient: Recipient | undefined;
};

export function EmailPreview({ formData, recipient }: EmailPreviewProps) {
  const [mode, setMode] = useState<"rendered" | "code">("rendered");

  const subject = interpolate(formData.subject, recipient);
  const html = renderEmailHtml(formData.htmlTemplate, recipient);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-muted-foreground text-xs uppercase tracking-wide">Assunto</p>
          <p className="truncate font-medium">{subject || "—"}</p>
          <p className="text-muted-foreground mt-1 truncate text-xs">
            Para: {recipient?.['email'] ?? "carregue um CSV para ver o preview"}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setMode(mode === "rendered" ? "code" : "rendered")}
        >
          {mode === "rendered" ? <Code2 className="size-4" /> : <Eye className="size-4" />}
          {mode === "rendered" ? "Ver código" : "Ver renderizado"}
        </Button>
      </div>

      {mode === "rendered" ? (
        <iframe
          title="Preview do e-mail"
          sandbox=""
          srcDoc={html}
          className="bg-card h-[520px] w-full rounded-lg border"
        />
      ) : (
        <pre className="bg-muted/40 max-h-[520px] overflow-auto rounded-lg border p-4 font-mono text-xs leading-relaxed">
          {html}
        </pre>
      )}
    </div>
  );
}
