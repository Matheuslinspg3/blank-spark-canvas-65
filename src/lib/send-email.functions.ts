import { createServerFn } from "@tanstack/react-start";

import { sendCampaignViaBrevo } from "./brevo.server";
import type { SendBulkPayload } from "./bulk-email";

export const sendBulkEmailsFn = createServerFn({ method: "POST" })
  .inputValidator((data: SendBulkPayload) => data)
  .handler(async ({ data }) => sendCampaignViaBrevo(data));
