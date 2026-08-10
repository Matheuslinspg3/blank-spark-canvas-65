import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Bot, KeyRound, Loader2, MailCheck, Save, Trash2, Zap } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  AI_COLUMN,
  DEFAULT_AI_SETTINGS,
  clearAiSettings,
  loadAiSettings,
  saveAiSettings,
  testAiConnection,
  type AiSettings,
} from "@/lib/ai-config";

export const Route = createFileRoute("/configuracoes")({
  head: () => ({
    meta: [
      { title: "Configurações de IA — Disparo Tracker" },
      {
        name: "description",
        content:
          "Configure a base URL, a API key e o modelo da IA que gera e-mails personalizados a partir do seu CSV.",
      },
      { property: "og:title", content: "Configurações de IA — Disparo Tracker" },
      {
        property: "og:description",
        content: "Base URL, API key, modelo e prompt de pesquisa para personalizar cada e-mail.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ConfiguracoesPage,
});

function ConfiguracoesPage() {
  const [settings, setSettings] = useState<AiSettings>(DEFAULT_AI_SETTINGS);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    setSettings(loadAiSettings());
  }, []);

  function update(patch: Partial<AiSettings>) {
    setSettings((prev) => ({ ...prev, ...patch }));
  }

  function handleSave() {
    saveAiSettings(settings);
    toast.success("Configurações salvas neste navegador");
  }

  async function handleTest() {
    if (!settings.baseUrl.trim() || !settings.apiKey.trim()) {
      toast.error("Informe a base URL e a API key.");
      return;
    }
    setTesting(true);
    try {
      await testAiConnection(settings);
      toast.success("Conexão com a IA funcionando");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao conectar na IA");
    } finally {
      setTesting(false);
    }
  }

  function handleClear() {
    clearAiSettings();
    setSettings(DEFAULT_AI_SETTINGS);
    toast.success("Configurações removidas");
  }

  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 px-4 py-10">
      <header className="space-y-2">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link to="/">
            <ArrowLeft className="size-4" />
            Voltar ao disparo
          </Link>
        </Button>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Bot className="text-primary size-6" />
          Configurações de IA
        </h1>
        <p className="text-muted-foreground text-sm">
          Conecte qualquer API compatível com OpenAI (OpenAI, OpenRouter, Groq, Together, LM Studio…)
          para gerar um trecho personalizado para cada destinatário do CSV.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <KeyRound className="size-4" />
            Credenciais
          </CardTitle>
          <CardDescription>Ficam salvas apenas neste navegador (localStorage).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="baseUrl">Base URL</Label>
            <Input
              id="baseUrl"
              value={settings.baseUrl}
              placeholder="https://api.openai.com/v1"
              onChange={(e) => update({ baseUrl: e.target.value })}
            />
            <p className="text-muted-foreground text-xs">
              O endpoint chamado será <code className="font-mono">{"{base URL}/chat/completions"}</code>.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="apiKey">API key</Label>
              <Input
                id="apiKey"
                type="password"
                autoComplete="off"
                value={settings.apiKey}
                placeholder="sk-..."
                onChange={(e) => update({ apiKey: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="model">Modelo</Label>
              <Input
                id="model"
                value={settings.model}
                placeholder="gpt-4o-mini"
                onChange={(e) => update({ model: e.target.value })}
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={handleSave}>
              <Save className="size-4" />
              Salvar
            </Button>
            <Button variant="outline" disabled={testing} onClick={() => void handleTest()}>
              {testing ? <Loader2 className="size-4 animate-spin" /> : <Zap className="size-4" />}
              Testar conexão
            </Button>
            <Button variant="ghost" onClick={handleClear}>
              <Trash2 className="size-4" />
              Limpar
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Prompt de pesquisa</CardTitle>
          <CardDescription>
            Instrução usada para cada destinatário. Todas as colunas do CSV são enviadas como
            contexto.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            rows={10}
            spellCheck={false}
            className="bg-muted/40 text-xs leading-relaxed"
            value={settings.researchPrompt}
            onChange={(e) => update({ researchPrompt: e.target.value })}
          />
          <Alert>
            <Bot className="size-4" />
            <AlertTitle>Como usar no template</AlertTitle>
            <AlertDescription>
              O texto gerado vira a coluna <code className="font-mono">{`{{${AI_COLUMN}}}`}</code>,
              que você pode inserir em qualquer lugar do assunto ou do HTML.
            </AlertDescription>
          </Alert>
          <Button onClick={handleSave}>
            <Save className="size-4" />
            Salvar prompt
          </Button>
        </CardContent>
      </Card>

      <SendersCard />

      <Alert>
        <KeyRound className="size-4" />
        <AlertTitle>Sobre segurança</AlertTitle>
        <AlertDescription>
          A chave é usada direto do navegador. Prefira uma chave com escopo/limite reduzido, ou peça
          para movermos a chamada para o backend.
        </AlertDescription>
      </Alert>
    </main>
  );
}

function SendersCard() {
  const [config, setConfig] = useState<SendersConfig>(EMPTY_SENDERS);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  useEffect(() => {
    setConfig(loadSenders());
  }, []);

  function persist(next: SendersConfig) {
    setConfig(next);
    saveSenders(next);
  }

  function handleAdd() {
    const trimmed = email.trim().toLowerCase();
    if (!isValidEmail(trimmed)) {
      toast.error("Informe um e-mail válido.");
      return;
    }
    if (config.list.some((s) => s.email === trimmed)) {
      toast.error("Esse remetente já está na lista.");
      return;
    }
    persist({
      list: [...config.list, { name: name.trim(), email: trimmed }],
      defaultEmail: config.defaultEmail || trimmed,
    });
    setName("");
    setEmail("");
    toast.success("Remetente adicionado");
  }

  function handleRemove(target: string) {
    const list = config.list.filter((s) => s.email !== target);
    persist({
      list,
      defaultEmail: config.defaultEmail === target ? (list[0]?.email ?? "") : config.defaultEmail,
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <MailCheck className="size-4" />
          Remetentes verificados (Brevo)
        </CardTitle>
        <CardDescription>
          Cadastre aqui apenas os endereços já verificados na Brevo (Senders &amp; IPs → Senders).
          Com a lista preenchida, o disparo só permite escolher um deles.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2 sm:grid-cols-[1fr_1.4fr_auto]">
          <Input
            value={name}
            placeholder="Nome (ex.: Equipe Acme)"
            onChange={(e) => setName(e.target.value)}
          />
          <Input
            type="email"
            value={email}
            placeholder="contato@suaempresa.com"
            onChange={(e) => setEmail(e.target.value)}
          />
          <Button onClick={handleAdd}>Adicionar</Button>
        </div>

        {config.list.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Nenhum remetente cadastrado — o disparo continua pedindo o e-mail digitado.
          </p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {config.list.map((sender) => (
              <li key={sender.email} className="flex items-center gap-3 p-3 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{sender.name || sender.email}</p>
                  <p className="text-muted-foreground truncate text-xs">{sender.email}</p>
                </div>
                {config.defaultEmail === sender.email ? (
                  <span className="text-primary text-xs font-medium">Padrão</span>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => persist({ ...config, defaultEmail: sender.email })}
                  >
                    Tornar padrão
                  </Button>
                )}
                <Button variant="ghost" size="icon" onClick={() => handleRemove(sender.email)}>
                  <Trash2 className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

