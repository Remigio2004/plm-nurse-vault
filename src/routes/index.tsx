import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Lock, Mail, ShieldCheck } from "lucide-react";
import { useState } from "react";

import seal from "@/assets/plm-con-seal.png";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "NurseVault — PLM College of Nursing Records Portal" },
      {
        name: "description",
        content:
          "Sign in to NurseVault, the digital records storage and retrieval portal for the PLM College of Nursing archival office.",
      },
      { property: "og:title", content: "NurseVault — PLM College of Nursing Records Portal" },
      {
        property: "og:description",
        content: "Digital records storage and retrieval for the PLM College of Nursing.",
      },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  const handleSignIn = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setTimeout(() => navigate({ to: "/dashboard" }), 550);
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-surface px-4 py-10">
      <div
        aria-hidden
        className="pointer-events-none absolute -left-32 -top-32 h-96 w-96 rounded-full bg-primary/10 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-40 -right-24 h-96 w-96 rounded-full bg-gold/15 blur-3xl"
      />

      <div className="relative w-full max-w-md">
        <div className="mb-6 flex flex-col items-center text-center">
          <img
            src={seal}
            alt="PLM College of Nursing seal"
            width={816}
            height={816}
            className="h-24 w-24 object-contain drop-shadow-sm"
          />
          <h1 className="mt-4 text-3xl font-semibold tracking-tight text-primary">NurseVault</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Digital Records Storage &amp; Retrieval System
          </p>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Pamantasan ng Lungsod ng Maynila · College of Nursing
          </p>
        </div>

        <div className="vault-card p-7">
          <div className="mb-6 h-1 w-14 rounded-full bg-gold" />
          <h2 className="text-lg font-semibold text-foreground">Sign in to your account</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Authorized records office personnel only.
          </p>

          <form className="mt-6 space-y-4" onSubmit={handleSignIn}>
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-medium">
                Email address
              </Label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  defaultValue="records.office@plm.edu.ph"
                  className="h-11 rounded-xl pl-9"
                  placeholder="you@plm.edu.ph"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-medium">
                Password
              </Label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="password"
                  type="password"
                  defaultValue="demo-password"
                  className="h-11 rounded-xl pl-9"
                  placeholder="••••••••"
                />
              </div>
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="h-11 w-full rounded-xl bg-primary text-primary-foreground shadow-soft transition-all duration-200 hover:-translate-y-0.5 hover:bg-secondary hover:shadow-lift"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground/40 border-t-primary-foreground" />
                  Signing in…
                </span>
              ) : (
                "Sign in"
              )}
            </Button>
          </form>

          <div className="mt-6 flex items-center gap-2 rounded-xl bg-gold-soft px-3 py-2.5">
            <ShieldCheck className="h-4 w-4 shrink-0 text-gold-foreground" />
            <p className="text-xs text-gold-foreground">
              UI prototype — any credentials will take you to the dashboard.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
