import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Check, Copy, Link2, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { createTrackedLinkFn, type TrackedLink } from "@/lib/tracked-links.functions";
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
  trigger,
}: {
  defaultUrl?: string;
  trigger?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState(defaultUrl);
  const [created, setCreated] = useState<TrackedLink | null>(null);
  const [copied, setCopied] = useState(false);

  const createMutation = useMutation({
    mutationFn: (destinationUrl: string) => createTrackedLinkFn({ data: { destinationUrl } }),
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
    createMutation.mutate(trimmed);
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
            Cole o endereço de destino. O sistema gera um link curto que conta cada clique. Depois é
            só colar esse link no texto ou no HTML do e-mail.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="tracked-link-destination">Endereço de destino</Label>
            <div className="flex gap-2">
              <Input
                id="tracked-link-destination"
                placeholder="https://wa.me/5513… ou https://seusite.com.br"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
              />
              <Button onClick={handleCreate} disabled={createMutation.isPending}>
                {createMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : "Gerar"}
              </Button>
            </div>
          </div>
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
                Cada clique nesse link aparece na página Links, com data e hora.
              </p>
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
