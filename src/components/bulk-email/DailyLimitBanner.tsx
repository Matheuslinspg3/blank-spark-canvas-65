/**
 * Faixa de limite diário mostrada acima do botão de disparo.
 */
import { AlertTriangle, Gauge } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";

type Props = {
  dailyLimit: number;
  sentLast24h: number;
  nearLimit: boolean;
  limitReached: boolean;
};

export function DailyLimitBanner({ dailyLimit, sentLast24h, nearLimit, limitReached }: Props) {
  const percent = Math.min(100, Math.round((sentLast24h / Math.max(1, dailyLimit)) * 100));

  return (
    <div className="space-y-2">
      <div className="text-muted-foreground flex items-center justify-between text-xs">
        <span className="flex items-center gap-1">
          <Gauge className="size-3.5" />
          {sentLast24h} de {dailyLimit} e-mails nas últimas 24h
        </span>
        <span>{percent}%</span>
      </div>
      <Progress value={percent} />
      {limitReached && (
        <Alert variant="destructive">
          <AlertTriangle className="size-4" />
          <AlertTitle>Limite diário atingido</AlertTitle>
          <AlertDescription>
            Para proteger a reputação do seu domínio, o disparo só continua quando o contador de 24h
            baixar. Você pode ajustar o limite em Configurações.
          </AlertDescription>
        </Alert>
      )}
      {!limitReached && nearLimit && (
        <Alert>
          <AlertTriangle className="size-4" />
          <AlertTitle>Perto do limite diário</AlertTitle>
          <AlertDescription>
            Restam {dailyLimit - sentLast24h} envios hoje. Evite picos: use a janela de horário com
            intervalo entre os e-mails.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
