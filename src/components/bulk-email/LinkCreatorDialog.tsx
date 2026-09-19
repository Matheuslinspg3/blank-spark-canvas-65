import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Check, Copy, Link2, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { createTrackedLinkFn, type TrackedLink } from "@/lib/tracked-links.functions";
import { listCampaigns } from "@/lib/campaigns.functions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function LinkCreatorDialog({
  defaultUrl = "",
  defaultRecipient = "",
  defaultCampaignId = "",
  trigger,
}: {
  defaultUrl?: string;
  defaultRecipient?: string;
  defaultCampaignId?: string;
  trigger?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState(defaultUrl);
  const [recipient, setRecipient] = useState(defaultRecipient);
  const [campaignId, setCampaignId] = useState(defaultCampaignId || "none");
  const [created, setCreated] = useState<TrackedLink | null>(null);
  const [copied, setCopied] = useState(false);

  const { data: campaigns } = useQuery({
    queryKey: ["campaigns"],
    queryFn: () => listCampaigns(),
    enabled: open,
  });

  const createMutation = useMutation({
    mutationFn: (input: { destinationUrl: string; recipientEmail?: string; campaignId?: string }) =>
      createTrackedLinkFn({ data: input }),
    onSuccess: (link) => {
      setCreated(link);
      setCopied(false);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const handleCreate = () => {
    const trimmed = url.trim();
    if (!/^https?:\/\//i.test(trimmed)) {
      toast.error("Cole um endereço começando com http:// ou https://");
      return;
    }
    const email = recipient.trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error("E-mail do destinatário inválido");
      return;
    }
    const input: { destinationUrl: string; recipientEmail?: string; campaignId?: string } = {
      destinationUrl: trimmed,
    };
    if (email) input.recipientEmail = email;
    if (campaignId !== "none") input.campaignId = campaignId;
    createMutation.mutate(input);
  };

  const handleCopy = async () => {
    if (!created?.tracking_url) return;
    if (await copyText(created.tracking_url)) {
      setCopied(true);
      toast.success("Link copiado");
    } else {
      toast.error("Não consegui copiar. Selecione e copie manualmente.");
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setCreated(null);
          setCopied(false);
        }
      }}
    >
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline" size="sm">
            <Link2 className="size-4" />
            Criar link rastreado
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Criar link rastreado</DialogTitle>
          <DialogDescription>
            Cole o endereço de destino. Para saber quem clicou, informe o destinatário e/ou vincule
            o link a um disparo.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="tracked-link-destination">Endereço de destino</Label>
            <Input
              id="tracked-link-destination"
              placeholder="https://wa.me/5513… ou https://seusite.com.br"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="tracked-link-recipient">Destinatário (opcional)</Label>
            <Input
              id="tracked-link-recipient"
              type="email"
              placeholder="contato@empresa.com.br"
              value={recipient}
              onChange={(event) => setRecipient(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Disparo vinculado (opcional)</Label>
            <Select value={campaignId} onValueChange={setCampaignId}>
              <SelectTrigger>
                <SelectValue placeholder="Nenhum" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Nenhum</SelectItem>
                {(campaigns ?? []).map((campaign) => (
                  <SelectItem key={campaign.id} value={campaign.id}>
                    {campaign.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={handleCreate} disabled={createMutation.isPending}>
            {createMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : "Gerar"}
          </Button>
          {created ? (
            <div className="space-y-2">
              <Label>Seu link rastreado</Label>
              {created.tracking_url ? (
                <div className="flex items-center gap-2">
                  <Input readOnly value={created.tracking_url} className="font-mono text-xs" />
                  <Button variant="secondary" onClick={() => void handleCopy()}>
                    {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                    {copied ? "Copiado" : "Copiar"}
                  </Button>
                </div>
              ) : (
                <p className="text-destructive text-sm">
                  O endereço público do site (TRACKING_ORIGIN) não está configurado. Sem ele o link
                  de rastreio não pode ser montado.
                </p>
              )}
              <p className="text-muted-foreground text-xs">
                Cada clique nesse link aparece na página Links
                {created.recipient_email ? `, vinculado a ${created.recipient_email}` : ""}
                {created.campaign_name ? ` e ao disparo "${created.campaign_name}"` : ""}, com data
                e hora.
              </p>
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
