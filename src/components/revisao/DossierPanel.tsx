import { ExternalLink, Search } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { CompanyDossier, ResearchSource } from "@/lib/company-research";

type Props = {
  dossier: CompanyDossier | null;
  sources: ResearchSource[];
  compact?: boolean;
};

/** Mostra o que a pesquisa descobriu sobre a empresa e as fontes usadas. */
export function DossierPanel({ dossier, sources, compact }: Props) {
  if (!dossier && sources.length === 0) {
    return (
      <p className="text-muted-foreground text-xs">
        Sem dossiê: este e-mail foi escrito sem dados de pesquisa.
      </p>
    );
  }

  return (
    <div className="bg-muted/40 space-y-3 rounded-lg border p-3 text-sm">
      <p className="flex items-center gap-1.5 text-xs font-medium tracking-wide uppercase">
        <Search className="size-3.5" />
        Dossiê da empresa
      </p>

      {dossier?.empresa && <p className="font-medium">{dossier.empresa}</p>}
      {dossier?.resumo && <p className="text-muted-foreground">{dossier.resumo}</p>}

      {dossier && dossier.servicos.length > 0 && (
        <div className="space-y-1">
          <p className="text-muted-foreground text-xs">Serviços/produtos</p>
          <div className="flex flex-wrap gap-1.5">
            {dossier.servicos.map((item) => (
              <Badge key={item} variant="secondary">
                {item}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {!compact && dossier?.publico && (
        <p className="text-muted-foreground text-xs">
          <span className="font-medium">Público:</span> {dossier.publico}
        </p>
      )}

      {!compact && dossier && dossier.diferenciais.length > 0 && (
        <div className="space-y-1">
          <p className="text-muted-foreground text-xs">Diferenciais</p>
          <ul className="text-muted-foreground list-disc space-y-0.5 pl-4 text-xs">
            {dossier.diferenciais.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      )}

      {!compact && dossier && dossier.sinais_recentes.length > 0 && (
        <div className="space-y-1">
          <p className="text-muted-foreground text-xs">Sinais recentes</p>
          <ul className="text-muted-foreground list-disc space-y-0.5 pl-4 text-xs">
            {dossier.sinais_recentes.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      )}

      {sources.length > 0 && (
        <div className="space-y-1">
          <p className="text-muted-foreground text-xs">Fontes ({sources.length})</p>
          <ul className="space-y-0.5 text-xs">
            {sources.map((source) => (
              <li key={source.url}>
                <a
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary inline-flex items-center gap-1 hover:underline"
                >
                  <ExternalLink className="size-3" />
                  <span className="max-w-[28rem] truncate">{source.title || source.url}</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
