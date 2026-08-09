import { CheckCircle2, ChevronLeft, ChevronRight, Copy, Save, Sparkles, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import type { CsvRow } from "@/lib/csv-rows";

type Props = {
  row: CsvRow | null;
  text: string;
  saving: boolean;
  hasPrev: boolean;
  hasNext: boolean;
  onTextChange: (value: string) => void;
  onSave: () => void;
  onToggleApprove: () => void;
  onPrev: () => void;
  onNext: () => void;
  onOpenChange: (open: boolean) => void;
};

export function EmailReviewDialog({
  row,
  text,
  saving,
  hasPrev,
  hasNext,
  onTextChange,
  onSave,
  onToggleApprove,
  onPrev,
  onNext,
  onOpenChange,
}: Props) {
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Texto copiado");
    } catch {
      toast.error("Não foi possível copiar");
    }
  }

  return (
    <Dialog open={row !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            {row?.nome || row?.email}
            {row?.is_personalized ? (
              <Badge className="gap-1.5 bg-emerald-600 text-white hover:bg-emerald-600">
                <Sparkles className="size-3.5" />
                Personalizado
              </Badge>
            ) : (
              <Badge variant="secondary" className="gap-1.5">
                <TriangleAlert className="size-3.5" />
                Genérico
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription>
            {row?.email}
            {row?.categoria ? ` · ${row.categoria}` : ""}
          </DialogDescription>
        </DialogHeader>

        <Textarea
          rows={20}
          className="text-sm leading-relaxed"
          value={text}
          onChange={(e) => onTextChange(e.target.value)}
        />

        <DialogFooter className="flex-wrap gap-2 sm:justify-between">
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={!hasPrev} onClick={onPrev}>
              <ChevronLeft className="size-4" />
              Anterior
            </Button>
            <Button variant="outline" size="sm" disabled={!hasNext} onClick={onNext}>
              Próximo
              <ChevronRight className="size-4" />
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" onClick={() => void copy()}>
              <Copy className="size-4" />
              Copiar
            </Button>
            <Button variant="outline" disabled={saving} onClick={onSave}>
              <Save className="size-4" />
              Salvar edição
            </Button>
            <Button
              variant={row?.approved ? "secondary" : "default"}
              disabled={saving}
              onClick={onToggleApprove}
            >
              <CheckCircle2 className="size-4" />
              {row?.approved ? "Aprovado (desfazer)" : "Aprovar"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
