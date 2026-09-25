import { z } from "zod";

export const BRIDGE_FIELDS = ["name", "whatsapp", "company"] as const;
export type BridgeField = (typeof BRIDGE_FIELDS)[number];

export const BRIDGE_FIELD_LABELS: Record<BridgeField, string> = {
  name: "Nome",
  whatsapp: "WhatsApp",
  company: "Empresa",
};

export const BRIDGE_PLACEHOLDERS: Record<BridgeField, string> = {
  name: "{nome}",
  whatsapp: "{whatsapp}",
  company: "{empresa}",
};

export type BridgeConfig = {
  logo_url: string;
  primary_color: string;
  title: string;
  subtitle: string;
  fields: BridgeField[];
  button_label: string;
};

export const MAX_LOGO_DATA_URL = 200_000;

export const bridgeConfigSchema = z.object({
  logo_url: z
    .string()
    .trim()
    .max(MAX_LOGO_DATA_URL, "Logo muito pesada (máx. ~150 KB)")
    .refine(
      (v) =>
        !v ||
        /^https:\/\//i.test(v) ||
        /^data:image\/(png|jpeg|webp|gif|svg\+xml);base64,/i.test(v),
      "A logo precisa ser um endereço https:// ou uma imagem enviada",
    )
    .default(""),
  primary_color: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, "Cor inválida (use #RRGGBB)")
    .default("#102a43"),
  title: z.string().trim().min(1, "Informe o título").max(120),
  subtitle: z.string().trim().max(300).default(""),
  fields: z.array(z.enum(BRIDGE_FIELDS)).min(1, "Escolha ao menos um dado para pedir"),
  button_label: z.string().trim().min(1).max(40).default("Falar no WhatsApp"),
});

export const DEFAULT_BRIDGE_CONFIG: BridgeConfig = {
  logo_url: "",
  primary_color: "#102a43",
  title: "Fale com nossa equipe",
  subtitle: "Preencha seus dados e continue a conversa pelo WhatsApp.",
  fields: ["name", "whatsapp", "company"],
  button_label: "Falar no WhatsApp",
};

export function onlyDigits(value: string): string {
  return value.replace(/\D/g, "");
}

/** Brazilian phone: DDD + 8/9 digits, optionally prefixed with 55. */
export function isValidBrPhone(value: string): boolean {
  let d = onlyDigits(value);
  if (d.length >= 12 && d.startsWith("55")) d = d.slice(2);
  return /^[1-9]{2}9?\d{8}$/.test(d);
}

export function formatBrPhone(value: string): string {
  const d = onlyDigits(value).slice(0, 11);
  if (d.length <= 2) return d ? `(${d}` : "";
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export function buildWhatsappUrl(number: string, message: string): string {
  let d = onlyDigits(number);
  if (d.length <= 11) d = `55${d}`;
  return `https://wa.me/${d}${message.trim() ? `?text=${encodeURIComponent(message)}` : ""}`;
}

/** Replaces {nome}/{whatsapp}/{empresa} in every query parameter of the destination. */
export function fillDestination(
  destination: string,
  values: Partial<Record<BridgeField, string>>,
): string {
  const url = new URL(destination);
  const replace = (text: string) =>
    text
      .replaceAll(BRIDGE_PLACEHOLDERS.name, values.name ?? "")
      .replaceAll(BRIDGE_PLACEHOLDERS.whatsapp, values.whatsapp ?? "")
      .replaceAll(BRIDGE_PLACEHOLDERS.company, values.company ?? "");
  const next = new URLSearchParams();
  url.searchParams.forEach((value, key) => next.append(key, replace(value)));
  url.search = next.toString().replace(/\+/g, "%20");
  return url.toString();
}

export function contrastText(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? "#111111" : "#ffffff";
}
