import { useRef } from "react";
import { ImageUp, X } from "lucide-react";
import { toast } from "sonner";

import {
  BRIDGE_FIELDS,
  BRIDGE_FIELD_LABELS,
  buildWhatsappUrl,
  onlyDigits,
  type BridgeConfig,
} from "@/lib/bridge-page";
import { BridgeCard } from "@/components/bridge/BridgeCard";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export type BridgeDraft = {
  config: BridgeConfig;
  destType: "whatsapp" | "url";
  waNumber: string;
  waMessage: string;
  url: string;
};

export const DEFAULT_WA_MESSAGE =
  "Olá! Sou {nome}, da empresa {empresa}. Meu WhatsApp é {whatsapp}. Gostaria de mais informações.";

/** Returns the destination URL or an error message. */
export function resolveBridgeDestination(draft: BridgeDraft): { url?: string; error?: string } {
  if (draft.destType === "whatsapp") {
    const digits = onlyDigits(draft.waNumber);
    if (digits.length < 10 || digits.length > 13)
      return { error: "Informe o número de WhatsApp de destino com DDD" };
    return { url: buildWhatsappUrl(digits, draft.waMessage) };
  }
  if (!/^https?:\/\//i.test(draft.url.trim()))
    return { error: "O destino precisa começar com http:// ou https://" };
  return { url: draft.url.trim() };
}

async function fileToDataUrl(file: File): Promise<string> {
  if (file.type === "image/svg+xml") {
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 400 / bitmap.width, 160 / bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/png");
}

export function BridgeLinkFields({
  value,
  onChange,
}: {
  value: BridgeDraft;
  onChange: (next: BridgeDraft) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const cfg = value.config;
  const setCfg = (patch: Partial<BridgeConfig>) =>
    onChange({ ...value, config: { ...cfg, ...patch } });

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) return toast.error("Envie uma imagem");
    try {
      const dataUrl = await fileToDataUrl(file);
      if (dataUrl.length > 200_000) return toast.error("Logo muito pesada. Use uma imagem menor.");
      setCfg({ logo_url: dataUrl });
    } catch {
      toast.error("Não consegui ler essa imagem");
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-4">
        <div className="space-y-2">
          <Label>Logo</Label>
          <div className="flex gap-2">
            <Input
              placeholder="https://… ou envie um arquivo"
              value={cfg.logo_url.startsWith("data:") ? "Imagem enviada" : cfg.logo_url}
              readOnly={cfg.logo_url.startsWith("data:")}
              onChange={(e) => setCfg({ logo_url: e.target.value })}
            />
            {cfg.logo_url ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Remover logo"
                onClick={() => setCfg({ logo_url: "" })}
              >
                <X className="size-4" />
              </Button>
            ) : null}
            <Button type="button" variant="outline" onClick={() => fileRef.current?.click()}>
              <ImageUp className="size-4" />
              Enviar
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                void handleFile(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="bridge-color">Cor primária</Label>
          <div className="flex gap-2">
            <input
              id="bridge-color"
              type="color"
              value={cfg.primary_color}
              onChange={(e) => setCfg({ primary_color: e.target.value })}
              className="h-10 w-14 cursor-pointer rounded-md border"
            />
            <Input
              value={cfg.primary_color}
              maxLength={7}
              onChange={(e) => setCfg({ primary_color: e.target.value })}
              className="font-mono"
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="bridge-title">Título principal</Label>
          <Input
            id="bridge-title"
            maxLength={120}
            value={cfg.title}
            onChange={(e) => setCfg({ title: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="bridge-subtitle">Subtítulo</Label>
          <Textarea
            id="bridge-subtitle"
            maxLength={300}
            rows={2}
            value={cfg.subtitle}
            onChange={(e) => setCfg({ subtitle: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label>Dados a pedir</Label>
          <div className="flex flex-wrap gap-4">
            {BRIDGE_FIELDS.map((field) => (
              <label key={field} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={cfg.fields.includes(field)}
                  onCheckedChange={(checked) =>
                    setCfg({
                      fields: checked
                        ? BRIDGE_FIELDS.filter((f) => f === field || cfg.fields.includes(f))
                        : cfg.fields.filter((f) => f !== field),
                    })
                  }
                />
                {BRIDGE_FIELD_LABELS[field]}
              </label>
            ))}
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="bridge-button">Texto do botão</Label>
          <Input
            id="bridge-button"
            maxLength={40}
            value={cfg.button_label}
            onChange={(e) => setCfg({ button_label: e.target.value })}
          />
        </div>
        <div className="space-y-2 rounded-lg border p-3">
          <Label>Destino final</Label>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant={value.destType === "whatsapp" ? "default" : "outline"}
              onClick={() => onChange({ ...value, destType: "whatsapp" })}
            >
              WhatsApp
            </Button>
            <Button
              type="button"
              size="sm"
              variant={value.destType === "url" ? "default" : "outline"}
              onClick={() => onChange({ ...value, destType: "url" })}
            >
              Outro endereço
            </Button>
          </div>
          {value.destType === "whatsapp" ? (
            <>
              <Input
                placeholder="Número com DDD, ex: 13 99999-9999"
                inputMode="tel"
                value={value.waNumber}
                onChange={(e) => onChange({ ...value, waNumber: e.target.value })}
              />
              <Textarea
                rows={3}
                value={value.waMessage}
                onChange={(e) => onChange({ ...value, waMessage: e.target.value })}
              />
            </>
          ) : (
            <Input
              placeholder="https://seusite.com.br/obrigado?nome={nome}"
              value={value.url}
              onChange={(e) => onChange({ ...value, url: e.target.value })}
            />
          )}
          <p className="text-muted-foreground text-xs">
            Use {"{nome}"}, {"{whatsapp}"} e {"{empresa}"} — são trocados pelo que a pessoa
            preencher.
          </p>
        </div>
      </div>
      <div className="space-y-2">
        <Label>Prévia</Label>
        <div className="from-muted/60 via-background to-muted/40 flex justify-center rounded-xl border bg-gradient-to-br p-4">
          <BridgeCard config={cfg} preview />
        </div>
      </div>
    </div>
  );
}
