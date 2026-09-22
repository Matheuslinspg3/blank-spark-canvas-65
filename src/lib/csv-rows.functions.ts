import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { CsvRowEvent, CsvRowEventInput } from "./csv-row-events";
import type { CsvRow, CsvRowPatch } from "./csv-rows";

export const logCsvRowEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { event: CsvRowEventInput }) => input)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("csv_row_events")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .insert({ ...data.event, user_id: context.userId } as any);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listCsvRowEvents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("csv_row_events")
      .select("*")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(1000);
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as CsvRowEvent[];
  });

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
