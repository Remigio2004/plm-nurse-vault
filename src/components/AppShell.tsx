import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  FolderTree,
  History,
  LayoutDashboard,
  LogOut,
  Search,
  ShieldAlert,
  Upload,
  Menu,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import seal from "@/assets/plm-con-seal.png";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useVault } from "@/lib/vault-store";
import { cn } from "@/lib/utils";

const navItems = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/upload", label: "Upload Record", icon: Upload },
  { to: "/browse", label: "Browse Folders", icon: FolderTree },
  { to: "/activity", label: "Activity Log", icon: History },
] as const;

const IDLE_LIMIT_MS = 15 * 60 * 1000;
const WARNING_MS = 60 * 1000;

export function AppShell({
  title,
  description,
  children,
  searchPlaceholder = "Search records, students, batches…",
}: {
  title: string;
  description?: string;
  children: ReactNode;
  searchPlaceholder?: string;
}) {
  const { search, setSearch } = useVault();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [warning, setWarning] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(60);
  const lastActivity = useRef(Date.now());

  const signOut = useCallback(async () => {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/", replace: true });
  }, [navigate, queryClient]);

  const stayActive = useCallback(() => {
    lastActivity.current = Date.now();
    setWarning(false);
  }, []);

  useEffect(() => {
    const events = ["mousedown", "keydown", "touchstart", "scroll", "focus"] as const;
    const onActivity = () => {
      lastActivity.current = Date.now();
    };
    events.forEach((event) => window.addEventListener(event, onActivity, { passive: true }));

    const interval = window.setInterval(() => {
      const idle = Date.now() - lastActivity.current;
      if (idle >= IDLE_LIMIT_MS) {
        void signOut();
        return;
      }
      const remaining = IDLE_LIMIT_MS - idle;
      if (remaining <= WARNING_MS) {
        setWarning(true);
        setSecondsLeft(Math.max(1, Math.ceil(remaining / 1000)));
      } else {
        setWarning(false);
      }
    }, 1000);

    return () => {
      events.forEach((event) => window.removeEventListener(event, onActivity));
      window.clearInterval(interval);
    };
  }, [signOut]);


  const sidebar = (
    <div className="flex h-full w-72 flex-col border-r border-sidebar-border bg-sidebar">
      <div className="flex items-center gap-3 px-5 py-6">
        <img
          src={seal}
          alt="PLM College of Nursing seal"
          width={816}
          height={816}
          className="h-12 w-12 shrink-0 object-contain"
        />
        <div className="leading-tight">
          <p className="text-lg font-semibold tracking-tight text-primary">NurseVault</p>
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            PLM College of Nursing
          </p>
        </div>
      </div>

      <div className="mx-5 h-px bg-sidebar-border" />

      <nav className="flex flex-1 flex-col gap-1 p-4">
        <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Records Office
        </p>
        {navItems.map(({ to, label, icon: Icon }) => (
          <Link
            key={to}
            to={to}
            onClick={() => setMobileOpen(false)}
            className="group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-foreground/80 transition-all duration-200 hover:bg-sidebar-accent hover:text-primary data-[status=active]:bg-primary data-[status=active]:text-primary-foreground data-[status=active]:shadow-soft"
          >
            <Icon className="h-[18px] w-[18px] shrink-0 text-primary transition-colors group-data-[status=active]:text-gold" />
            {label}
          </Link>
        ))}
      </nav>

      <div className="p-4">
        <div className="mb-4 rounded-xl bg-primary-soft p-3">
          <p className="text-xs font-semibold text-primary">Secure session</p>
          <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
            You will be signed out automatically after 15 minutes of inactivity.
          </p>
        </div>
        <Button
          variant="ghost"
          className="w-full justify-start gap-3 rounded-xl text-sm font-medium text-foreground/80 hover:bg-destructive/10 hover:text-destructive"
          onClick={() => void signOut()}
        >
          <LogOut className="h-[18px] w-[18px]" />
          Log out
        </Button>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-surface">
      <aside className="sticky top-0 hidden h-screen lg:block">{sidebar}</aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            aria-label="Close navigation"
            className="absolute inset-0 bg-foreground/40"
            onClick={() => setMobileOpen(false)}
          />
          <div className="relative h-full animate-in slide-in-from-left duration-200">{sidebar}</div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur">
          <div className="flex flex-col gap-4 px-5 py-4 sm:px-8 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="icon"
                className="rounded-xl lg:hidden"
                onClick={() => setMobileOpen(true)}
                aria-label="Open navigation"
              >
                <Menu className="h-4 w-4" />
              </Button>
              <div>
                <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
                  {title}
                </h1>
                {description && (
                  <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
                )}
              </div>
            </div>

            <div className="relative w-full md:max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={searchPlaceholder}
                className="h-10 rounded-xl border-input bg-surface pl-9 text-sm"
              />
            </div>
          </div>
        </header>

        <main className={cn("flex-1 px-5 py-6 sm:px-8 sm:py-8")}>{children}</main>
      </div>

      <Dialog open={warning} onOpenChange={(open) => !open && stayActive()}>
        <DialogContent className="rounded-xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <ShieldAlert className="h-5 w-5 text-gold-foreground" />
              Session about to expire
            </DialogTitle>
            <DialogDescription>
              For record security you will be signed out in {secondsLeft}{" "}
              {secondsLeft === 1 ? "second" : "seconds"} due to inactivity.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="outline" className="rounded-xl" onClick={() => void signOut()}>
              Log out now
            </Button>
            <Button
              className="rounded-xl bg-primary text-primary-foreground hover:bg-secondary"
              onClick={stayActive}
            >
              Stay signed in
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
