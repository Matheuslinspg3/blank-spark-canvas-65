import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { collectResearch } from "./company-research.server";

/** Pesquisa a empresa na web (site + busca) e devolve o material bruto e as fontes. */
export const researchCompany = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { domain: string; nome: string; categoria: string }) => input)
  .handler(async ({ data }) => collectResearch(data));
