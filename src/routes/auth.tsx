import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Mail } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Entrar — Disparo Tracker" },
      {
        name: "description",
        content: "Acesse sua conta do Disparo Tracker para criar e acompanhar seus disparos de e-mail.",
      },
      { property: "og:title", content: "Entrar — Disparo Tracker" },
      {
        property: "og:description",
        content: "Acesse sua conta para criar rascunhos e acompanhar campanhas de e-mail em massa.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) void navigate({ to: "/disparos", replace: true });
    });
  }, [navigate]);

  async function signIn(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    void navigate({ to: "/disparos", replace: true });
  }

  async function signUp(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: window.location.origin },
    });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    if (data.session) {
      void navigate({ to: "/disparos", replace: true });
      return;
    }
    toast.success("Conta criada. Confirme o e-mail para entrar.");
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="text-primary size-5" />
            Disparo Tracker
          </CardTitle>
          <CardDescription>Entre para criar disparos e salvar rascunhos.</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="login">
            <TabsList className="w-full">
              <TabsTrigger value="login" className="flex-1">
                Entrar
              </TabsTrigger>
              <TabsTrigger value="signup" className="flex-1">
                Criar conta
              </TabsTrigger>
            </TabsList>

            <TabsContent value="login" className="pt-4">
              <form className="space-y-4" onSubmit={(e) => void signIn(e)}>
                <Fields
                  email={email}
                  password={password}
                  onEmail={setEmail}
                  onPassword={setPassword}
                />
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "Entrando…" : "Entrar"}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="signup" className="pt-4">
              <form className="space-y-4" onSubmit={(e) => void signUp(e)}>
                <Fields
                  email={email}
                  password={password}
                  onEmail={setEmail}
                  onPassword={setPassword}
                />
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "Criando…" : "Criar conta"}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </main>
  );
}

function Fields({
  email,
  password,
  onEmail,
  onPassword,
}: {
  email: string;
  password: string;
  onEmail: (value: string) => void;
  onPassword: (value: string) => void;
}) {
  return (
    <>
      <div className="space-y-2">
        <Label htmlFor="email">E-mail</Label>
        <Input
          id="email"
          type="email"
          required
          value={email}
          onChange={(e) => onEmail(e.target.value)}
          placeholder="voce@empresa.com"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Senha</Label>
        <Input
          id="password"
          type="password"
          required
          minLength={6}
          value={password}
          onChange={(e) => onPassword(e.target.value)}
          placeholder="••••••••"
        />
      </div>
    </>
  );
}
