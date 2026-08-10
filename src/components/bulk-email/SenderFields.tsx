import { Info } from "lucide-react";
import { useEffect, useState } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EMPTY_SENDERS, loadSenders, type SendersConfig } from "@/lib/senders";

type SenderFieldsProps = {
  senderName: string;
  senderEmail: string;
  disabled?: boolean;
  compact?: boolean;
  onChange: (patch: { senderName?: string; senderEmail?: string }) => void;
};

/**
 * Campos de remetente. Quando existem remetentes verificados configurados em
 * /configuracoes, vira um seletor restrito a essa lista.
 */
export function SenderFields({
  senderName,
  senderEmail,
  disabled,
  compact,
  onChange,
}: SenderFieldsProps) {
  const [config, setConfig] = useState<SendersConfig>(EMPTY_SENDERS);

  useEffect(() => {
    setConfig(loadSenders());
  }, []);

  if (config.list.length > 0) {
    return (
      <div className="space-y-2">
        {!compact && <Label htmlFor="senderPick">Remetente verificado</Label>}
        <Select
          value={config.list.some((s) => s.email === senderEmail) ? senderEmail : ""}
          disabled={disabled}
          onValueChange={(email) => {
            const sender = config.list.find((s) => s.email === email);
            onChange({ senderEmail: email, senderName: sender?.name ?? senderName });
          }}
        >
          <SelectTrigger id="senderPick" className={compact ? "h-9" : undefined}>
            <SelectValue placeholder="Escolha um remetente verificado" />
          </SelectTrigger>
          <SelectContent>
            {config.list.map((sender) => (
              <SelectItem key={sender.email} value={sender.email}>
                {sender.name ? `${sender.name} <${sender.email}>` : sender.email}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-muted-foreground flex items-start gap-1.5 text-xs">
          <Info className="mt-0.5 size-3 shrink-0" />
          Lista definida em Configurações. Só remetentes verificados na Brevo funcionam como "De:".
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="space-y-1.5">
          {!compact && <Label htmlFor="senderName">Nome do remetente</Label>}
          <Input
            id="senderName"
            value={senderName}
            disabled={disabled}
            className={compact ? "h-9" : undefined}
            aria-label="Nome do remetente"
            placeholder="Equipe Acme"
            onChange={(e) => onChange({ senderName: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          {!compact && <Label htmlFor="senderEmail">E-mail do remetente</Label>}
          <Input
            id="senderEmail"
            type="email"
            value={senderEmail}
            disabled={disabled}
            className={compact ? "h-9" : undefined}
            aria-label="E-mail do remetente"
            placeholder="contato@suaempresa.com"
            onChange={(e) => onChange({ senderEmail: e.target.value })}
          />
        </div>
      </div>
      <p className="text-muted-foreground flex items-start gap-1.5 text-xs">
        <Info className="mt-0.5 size-3 shrink-0" />
        O e-mail precisa estar verificado na Brevo (Senders &amp; IPs → Senders). Cadastre seus
        remetentes em Configurações para escolher de uma lista.
      </p>
    </div>
  );
}
