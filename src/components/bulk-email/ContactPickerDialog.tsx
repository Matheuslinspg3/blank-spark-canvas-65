import { useServerFn } from "@tanstack/react-start";
import { Search, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { listCsvRows } from "@/lib/csv-rows.functions";
import type { CsvRow } from "@/lib/csv-rows";

const PAGE_SIZE = 50;

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (rows: CsvRow[]) => void;
};

export function ContactPickerDialog({ open, onOpenChange, onConfirm }: Props) {
  const fetchContacts = useServerFn(listCsvRows);
  const [rows, setRows] = useState<CsvRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const [categoria, setCategoria] = useState("todos");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sort, setSort] = useState("nome-asc");
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetchContacts()
      .then((data) => {
        setRows(data);
        setSelected(new Set(data.map((row) => row.id)));
      })
      .catch((err: unknown) =>
        toast.error(err instanceof Error ? err.message : "Não foi possível carregar seus contatos."),
      )
      .finally(() => setLoading(false));
  }, [open, fetchContacts]);

  const categorias = useMemo(
    () => Array.from(new Set(rows.map((row) => row.categoria).filter(Boolean))).sort(),
    [rows],
  );

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    const list = rows.filter((row) => {
      if (categoria !== "todos" && row.categoria !== categoria) return false;
      if (!term) return true;
      return (
        row.nome.toLowerCase().includes(term) || row.email.toLowerCase().includes(term)
      );
    });
    const [field, dir] = sort.split("-") as ["nome" | "email", "asc" | "desc"];
    return [...list].sort((a, b) => {
      const cmp = (a[field] || "").localeCompare(b[field] || "", "pt-BR", {
        sensitivity: "base",
      });
      return dir === "asc" ? cmp : -cmp;
    });
  }, [rows, q, categoria, sort]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [q, categoria, sort]);

  const allFilteredSelected =
    filtered.length > 0 && filtered.every((row) => selected.has(row.id));

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllFiltered() {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const row of filtered) next.add(row.id);
      return next;
    });
  }

  function clearSelection() {
    setSelected(new Set());
  }

  function confirm() {
    const chosen = rows.filter((row) => selected.has(row.id));
    if (chosen.length === 0) {
      toast.error("Selecione ao menos um contato.");
      return;
    }
    onConfirm(chosen);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="inline-flex items-center gap-2">
            <Users className="size-4" />
            Selecionar contatos
          </DialogTitle>
          <DialogDescription>
            Busque e escolha quem entra neste disparo.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[12rem] flex-1">
            <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <Input
              value={q}
              placeholder="Buscar por nome ou e-mail…"
              className="pl-9"
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <Select value={categoria} onValueChange={setCategoria}>
            <SelectTrigger className="w-[12rem]">
              <SelectValue placeholder="Categoria" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todas as categorias</SelectItem>
              {categorias.map((item) => (
                <SelectItem key={item} value={item}>
                  {item}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={allFilteredSelected}
              onClick={selectAllFiltered}
            >
              Selecionar tudo
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={selected.size === 0}
              onClick={clearSelection}
            >
              Limpar seleção
            </Button>
            <Select value={sort} onValueChange={setSort}>
              <SelectTrigger className="h-8 w-[11rem]">
                <SelectValue placeholder="Ordenar" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="nome-asc">Nome (A–Z)</SelectItem>
                <SelectItem value="nome-desc">Nome (Z–A)</SelectItem>
                <SelectItem value="email-asc">E-mail (A–Z)</SelectItem>
                <SelectItem value="email-desc">E-mail (Z–A)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Badge variant="secondary">
            {selected.size} selecionados de {rows.length}
          </Badge>
        </div>

        <div className="max-h-80 space-y-1 overflow-auto rounded-lg border p-1">
          {loading && <p className="text-muted-foreground p-3 text-sm">Carregando…</p>}
          {!loading && filtered.length === 0 && (
            <p className="text-muted-foreground p-3 text-sm">Nenhum contato encontrado.</p>
          )}
          {pageRows.map((row) => (
            <label
              key={row.id}
              className="hover:bg-muted/60 flex cursor-pointer items-center gap-3 rounded-md px-3 py-2"
            >
              <Checkbox
                checked={selected.has(row.id)}
                onCheckedChange={() => toggle(row.id)}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">
                  {row.nome || "(sem nome)"}
                </span>
                <span className="text-muted-foreground block truncate text-xs">
                  {row.email}
                </span>
              </span>
              {row.categoria && (
                <Badge variant="outline" className="shrink-0 text-xs">
                  {row.categoria}
                </Badge>
              )}
            </label>
          ))}
        </div>

        <div className="flex items-center justify-between gap-2">
          <span className="text-muted-foreground text-xs">
            {filtered.length} contatos · página {currentPage} de {totalPages}
          </span>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={currentPage <= 1}
              onClick={() => setPage(currentPage - 1)}
            >
              Anterior
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={currentPage >= totalPages}
              onClick={() => setPage(currentPage + 1)}
            >
              Próxima
            </Button>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="button" onClick={confirm}>
            Usar {selected.size} contatos
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
