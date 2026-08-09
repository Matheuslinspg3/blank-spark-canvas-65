import { Search, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type RowFiltersValue = {
  q: string;
  categoria: string;
  status: string;
  personalizado: string;
};

type Props = {
  value: RowFiltersValue;
  categorias: string[];
  statusOptions: { value: string; label: string }[];
  statusLabel?: string;
  shown: number;
  total: number;
  onChange: (patch: Partial<RowFiltersValue>) => void;
  onClear: () => void;
};

export function RowFilters({
  value,
  categorias,
  statusOptions,
  statusLabel = "Status",
  shown,
  total,
  onChange,
  onClear,
}: Props) {
  const dirty =
    value.q !== "" ||
    value.categoria !== "todos" ||
    value.status !== "todos" ||
    value.personalizado !== "todos";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[14rem] flex-1">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            value={value.q}
            placeholder="Buscar por nome ou e-mail…"
            className="pl-9"
            onChange={(e) => onChange({ q: e.target.value })}
          />
        </div>

        <Select value={value.categoria} onValueChange={(v) => onChange({ categoria: v })}>
          <SelectTrigger className="w-[11rem]">
            <SelectValue placeholder="Categoria" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todas as categorias</SelectItem>
            {categorias.map((categoria) => (
              <SelectItem key={categoria} value={categoria}>
                {categoria}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={value.status} onValueChange={(v) => onChange({ status: v })}>
          <SelectTrigger className="w-[11rem]">
            <SelectValue placeholder={statusLabel} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">{statusLabel}: todos</SelectItem>
            {statusOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={value.personalizado} onValueChange={(v) => onChange({ personalizado: v })}>
          <SelectTrigger className="w-[11rem]">
            <SelectValue placeholder="Personalização" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Personalizado e genérico</SelectItem>
            <SelectItem value="sim">Somente personalizados</SelectItem>
            <SelectItem value="nao">Somente genéricos</SelectItem>
          </SelectContent>
        </Select>

        {dirty && (
          <Button variant="ghost" size="sm" onClick={onClear}>
            <X className="size-4" />
            Limpar filtros
          </Button>
        )}
      </div>
      <Badge variant="secondary">
        {shown} de {total}
      </Badge>
    </div>
  );
}
