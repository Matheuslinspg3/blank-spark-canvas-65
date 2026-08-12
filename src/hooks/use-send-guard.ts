/**
 * Guarda de disparo no cliente: limite diário (com aviso) e parada automática
 * quando a taxa de bounce/spam da campanha passa do seguro.
 */
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useState } from "react";

import {
  DEFAULT_LIMITS,
  LIMIT_WARN_RATIO,
  computeMetrics,
  loadLimits,
  riskAlerts,
  shouldStopCampaign,
} from "@/lib/deliverability";
import { getDailyUsage, listCampaignEvents } from "@/lib/deliverability.functions";

export function useSendGuard(campaignId: string) {
  const fetchUsage = useServerFn(getDailyUsage);
  const fetchEvents = useServerFn(listCampaignEvents);

  const [dailyLimit, setDailyLimit] = useState(DEFAULT_LIMITS.dailyLimit);
  const [sentLast24h, setSentLast24h] = useState(0);

  const refreshUsage = useCallback(async () => {
    try {
      const usage = await fetchUsage({});
      setSentLast24h(usage.sentLast24h);
    } catch {
      /* silencioso: o servidor ainda aplica o limite */
    }
  }, [fetchUsage]);

  useEffect(() => {
    setDailyLimit(loadLimits().dailyLimit);
    void refreshUsage();
  }, [refreshUsage]);

  /** Consulta os eventos da campanha e diz se o disparo deve parar. */
  const checkRisk = useCallback(async () => {
    try {
      const events = await fetchEvents({ data: { campaignId } });
      const metrics = computeMetrics(events);
      return { stop: shouldStopCampaign(metrics), alerts: riskAlerts(metrics) };
    } catch {
      return { stop: false, alerts: [] };
    }
  }, [campaignId, fetchEvents]);

  const remaining = Math.max(0, dailyLimit - sentLast24h);

  return {
    dailyLimit,
    sentLast24h,
    remaining,
    nearLimit: sentLast24h >= dailyLimit * LIMIT_WARN_RATIO && remaining > 0,
    limitReached: remaining === 0,
    refreshUsage,
    checkRisk,
  };
}
