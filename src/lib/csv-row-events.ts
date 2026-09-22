import type { CsvRowStatus } from "./csv-rows";

export type CsvRowEvent = {
  id: string;
  user_id: string;
  csv_row_id: string;
  run_id: string | null;
  from_status: CsvRowStatus | null;
  to_status: CsvRowStatus;
  is_personalized: boolean | null;
  site_ok: boolean | null;
  site_reason: string | null;
  research_ok: boolean | null;
  research_sources_count: number | null;
  error_message: string | null;
  created_at: string;
};

export type CsvRowEventInput = {
  csv_row_id: string;
  run_id?: string | null;
  from_status?: CsvRowStatus | null;
  to_status: CsvRowStatus;
  is_personalized?: boolean | null;
  site_ok?: boolean | null;
  site_reason?: string | null;
  research_ok?: boolean | null;
  research_sources_count?: number | null;
  error_message?: string | null;
};

export type RunSummary = {
  run_id: string;
  started_at: string;
  finished_at: string;
  rows: number;
  gerado: number;
  erro: number;
};

/** Agrupa eventos por execução (run_id) para o resumo de auditoria. */
export function summarizeRuns(events: CsvRowEvent[]): RunSummary[] {
  const map = new Map<
    string,
    { rows: Set<string>; times: string[]; gerado: number; erro: number }
  >();
  for (const event of events) {
    if (!event.run_id) continue;
    const entry = map.get(event.run_id) ?? {
      rows: new Set<string>(),
      times: [],
      gerado: 0,
      erro: 0,
    };
    entry.rows.add(event.csv_row_id);
    entry.times.push(event.created_at);
    if (event.to_status === "gerado") entry.gerado += 1;
    if (event.to_status === "erro") entry.erro += 1;
    map.set(event.run_id, entry);
  }
  return Array.from(map.entries())
    .map(([run_id, entry]) => {
      const sorted = entry.times.slice().sort();
      return {
        run_id,
        started_at: sorted[0] ?? "",
        finished_at: sorted[sorted.length - 1] ?? "",
        rows: entry.rows.size,
        gerado: entry.gerado,
        erro: entry.erro,
      };
    })
    .sort((a, b) => b.started_at.localeCompare(a.started_at));
}

export function formatDateTime(value: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "medium" });
}
