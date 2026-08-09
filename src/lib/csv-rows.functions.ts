import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { CsvRow, CsvRowPatch } from "./csv-rows";
import { extractReadableText } from "./site-scrape.server";

export const listCsvRows = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("csv_rows")
      .select("*")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as CsvRow[];
  });

export const importCsvRows = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { rows: { nome: string; email: string; categoria: string }[] }) => input)
  .handler(async ({ data, context }) => {
    const payload = data.rows
      .filter((row) => row.email.trim().length > 0)
      .map((row) => ({
        user_id: context.userId,
        nome: row.nome?.trim() ?? "",
        email: row.email.trim().toLowerCase(),
        categoria: row.categoria?.trim() ?? "",
      }));
    if (payload.length === 0) throw new Error("Nenhuma linha válida no CSV.");
    const { data: rows, error } = await context.supabase
      .from("csv_rows")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .insert(payload as any)
      .select("*");
    if (error) throw new Error(error.message);
    return (rows ?? []) as unknown as CsvRow[];
  });

export const updateCsvRow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; patch: CsvRowPatch }) => input)
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("csv_rows")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update(data.patch as any)
      .eq("id", data.id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row as unknown as CsvRow;
  });

export const deleteCsvRow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("csv_rows").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Busca o site do domínio e devolve o texto limpo (timeout de 5s). */
export const fetchSiteText = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { domain: string }) => input)
  .handler(async ({ data }) => {
    const domain = data.domain.trim().toLowerCase();
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) {
      return { ok: false as const, text: "", reason: "Domínio inválido" };
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch(`https://${domain}`, {
        signal: controller.signal,
        redirect: "follow",
        headers: { "user-agent": "Mozilla/5.0 (compatible; DisparoTracker/1.0)" },
      });
      if (!response.ok) {
        return { ok: false as const, text: "", reason: `HTTP ${response.status}` };
      }
      const html = await response.text();
      return { ok: true as const, text: extractReadableText(html), reason: "" };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao acessar o site";
      return { ok: false as const, text: "", reason: message };
    } finally {
      clearTimeout(timeout);
    }
  });
