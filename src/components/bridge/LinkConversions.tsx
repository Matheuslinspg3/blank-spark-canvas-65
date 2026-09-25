import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, UserCheck } from "lucide-react";

import { listLinkLeadsFn, type LinkLead } from "@/lib/tracked-links.functions";
import { formatBrPhone } from "@/lib/bridge-page";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function csvCell(value: string | null): string {
  const v = value ?? "";
  return /[",;\n]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v;
}

function downloadCsv(leads: LinkLead[]) {
  const header = ["Data", "Nome", "WhatsApp", "Empresa", "Página", "Destinatário", "Disparo"];
  const rows = leads.map((l) =>
    [
      new Date(l.created_at).toLocaleString("pt-BR"),
      l.name,
      l.whatsapp,
      l.company,
      l.link_title,
      l.recipient_email,
      l.campaign_name,
    ]
      .map(csvCell)
      .join(";"),
  );
  const blob = new Blob(["\uFEFF" + [header.join(";"), ...rows].join("\n")], {
    type: "text/csv;charset=utf-8",
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `leads-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function LinkConversions({ campaignId }: { campaignId?: string }) {
  const [linkFilter, setLinkFilter] = useState("all");
  const { data: leads = [], isLoading } = useQuery({
    queryKey: ["link-leads", campaignId ?? "all"],
    queryFn: () => listLinkLeadsFn({ data: campaignId ? { campaignId } : {} }),
    refetchInterval: 30_000,
  });

  const linkOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const l of leads) map.set(l.link_id, l.link_title || "Página sem título");
    return [...map.entries()];
  }, [leads]);

  const filtered = linkFilter === "all" ? leads : leads.filter((l) => l.link_id === linkFilter);

  if (campaignId && !isLoading && leads.length === 0) return null;

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
        <div className="space-y-1.5">
          <CardTitle className="flex items-center gap-2 text-base">
            <UserCheck className="text-primary size-4" />
            Conversões
          </CardTitle>
          <CardDescription>{filtered.length} leads capturados pelas Páginas Ponte</CardDescription>
        </div>
        <div className="flex gap-2">
          {linkOptions.length > 1 ? (
            <Select value={linkFilter} onValueChange={setLinkFilter}>
              <SelectTrigger className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as páginas</SelectItem>
                {linkOptions.map(([id, title]) => (
                  <SelectItem key={id} value={id}>
                    {title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
          <Button
            variant="outline"
            size="sm"
            disabled={filtered.length === 0}
            onClick={() => downloadCsv(filtered)}
          >
            <Download className="size-4" />
            CSV
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-muted-foreground text-sm">Carregando…</p>
        ) : filtered.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Nenhum lead ainda. Crie um link com Página Ponte para começar a capturar.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>WhatsApp</TableHead>
                  <TableHead>Empresa</TableHead>
                  <TableHead>Página</TableHead>
                  <TableHead>Destinatário</TableHead>
                  <TableHead>Disparo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="whitespace-nowrap">
                      {new Date(l.created_at).toLocaleString("pt-BR", {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </TableCell>
                    <TableCell>{l.name || "—"}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      {l.whatsapp ? (
                        <a
                          className="text-primary underline-offset-2 hover:underline"
                          href={`https://wa.me/${l.whatsapp.length <= 11 ? "55" : ""}${l.whatsapp}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {formatBrPhone(l.whatsapp.replace(/^55(?=\d{10,11}$)/, ""))}
                        </a>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell>{l.company || "—"}</TableCell>
                    <TableCell className="max-w-[160px] truncate">{l.link_title || "—"}</TableCell>
                    <TableCell className="max-w-[180px] truncate">
                      {l.recipient_email || "—"}
                    </TableCell>
                    <TableCell className="max-w-[160px] truncate">
                      {l.campaign_name || "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
