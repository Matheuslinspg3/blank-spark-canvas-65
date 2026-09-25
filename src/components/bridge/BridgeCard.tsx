import { useState, type FormEvent } from "react";
import { Loader2, ShieldCheck } from "lucide-react";

import {
  BRIDGE_FIELD_LABELS,
  contrastText,
  formatBrPhone,
  isValidBrPhone,
  type BridgeConfig,
  type BridgeField,
} from "@/lib/bridge-page";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const PLACEHOLDERS: Record<BridgeField, string> = {
  name: "Seu nome",
  whatsapp: "(11) 91234-5678",
  company: "Nome da empresa",
};

export function BridgeCard({
  config,
  onSubmit,
  preview = false,
}: {
  config: BridgeConfig;
  onSubmit?: (values: Partial<Record<BridgeField, string>>) => Promise<string | null>;
  preview?: boolean;
}) {
  const [values, setValues] = useState<Partial<Record<BridgeField, string>>>({});
  const [errors, setErrors] = useState<Partial<Record<BridgeField, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const color = config.primary_color || "#102a43";

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (preview || !onSubmit) return;
    const next: Partial<Record<BridgeField, string>> = {};
    for (const field of config.fields) {
      const value = (values[field] ?? "").trim();
      if (!value) next[field] = `Informe ${BRIDGE_FIELD_LABELS[field].toLowerCase()}`;
      else if (field === "whatsapp" && !isValidBrPhone(value))
        next[field] = "WhatsApp inválido — use DDD + número";
    }
    setErrors(next);
    if (Object.keys(next).length) return;
    setPending(true);
    setFormError(null);
    const error = await onSubmit(values);
    if (error) {
      setFormError(error);
      setPending(false);
    }
  };

  return (
    <div className="bg-card text-card-foreground w-full max-w-md rounded-2xl border shadow-xl">
      <div className="h-1.5 rounded-t-2xl" style={{ backgroundColor: color }} />
      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-5 p-6 sm:p-8">
        {config.logo_url ? (
          <div className="flex justify-center">
            <img
              src={config.logo_url}
              alt="Logo"
              className="max-h-16 max-w-[200px] object-contain"
            />
          </div>
        ) : null}
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-balance">
            {config.title || "Título"}
          </h1>
          {config.subtitle ? (
            <p className="text-muted-foreground text-sm text-pretty">{config.subtitle}</p>
          ) : null}
        </div>
        <div className="space-y-4">
          {config.fields.map((field) => (
            <div key={field} className="space-y-1.5">
              <Label htmlFor={`bridge-${field}`}>{BRIDGE_FIELD_LABELS[field]}</Label>
              <Input
                id={`bridge-${field}`}
                inputMode={field === "whatsapp" ? "tel" : "text"}
                autoComplete={
                  field === "name" ? "name" : field === "whatsapp" ? "tel" : "organization"
                }
                placeholder={PLACEHOLDERS[field]}
                value={values[field] ?? ""}
                maxLength={field === "whatsapp" ? 16 : 160}
                className="h-11"
                onChange={(e) =>
                  setValues((v) => ({
                    ...v,
                    [field]: field === "whatsapp" ? formatBrPhone(e.target.value) : e.target.value,
                  }))
                }
              />
              {errors[field] ? (
                <p className="text-destructive text-xs">{errors[field]}</p>
              ) : null}
            </div>
          ))}
        </div>
        {formError ? <p className="text-destructive text-center text-sm">{formError}</p> : null}
        <button
          type="submit"
          disabled={pending}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-lg text-base font-semibold shadow-sm transition-opacity hover:opacity-90 disabled:opacity-60"
          style={{ backgroundColor: color, color: contrastText(color) }}
        >
          {pending ? <Loader2 className="size-5 animate-spin" /> : null}
          {config.button_label || "Continuar"}
        </button>
        <p className="text-muted-foreground flex items-center justify-center gap-1.5 text-center text-xs">
          <ShieldCheck className="size-3.5 shrink-0" />
          Seus dados são usados apenas para este contato e ficam protegidos.
        </p>
      </form>
    </div>
  );
}
