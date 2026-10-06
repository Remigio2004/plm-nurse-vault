import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import seal from "@/assets/Nursing logo.png";
import { Button } from "@/components/ui/button";
import { DeviceVerifyLoader } from "@/components/DeviceVerifyLoader";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { supabase } from "@/integrations/supabase/client";

async function parseError(error: unknown, fallback: string) {
  const res = (error as { context?: Response }).context;
  if (res && typeof res.json === "function") {
    try {
      const b = await res.json();
      return {
        message: (b?.error as string) ?? fallback,
        retryAfter: b?.retryAfter as number | undefined,
      };
    } catch {
      // use fallback
    }
  }
  return { message: fallback, retryAfter: undefined };
}

const DEVICE_TOKEN_KEY = "nv_device_token";

function getDeviceToken(): string | null {
  try {
    return localStorage.getItem(DEVICE_TOKEN_KEY) || null;
  } catch {
    return null;
  }
}
function storeDeviceToken(token: string) {
  try {
    localStorage.setItem(DEVICE_TOKEN_KEY, token);
  } catch {
    // ignore (private mode / storage blocked)
  }
}
function clearDeviceToken() {
  try {
    localStorage.removeItem(DEVICE_TOKEN_KEY);
  } catch {
    // ignore
  }
}

export function OtpVerifyScreen({
  onVerified,
  onCancel,
}: {
  onVerified: () => void;
  onCancel: () => void;
}) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [checkingTrust, setCheckingTrust] = useState(true);
  const sentOnce = useRef(false);
  // undefined = hindi pa nababasa; null = walang token o nacheck na
  const deviceTokenRef = useRef<string | null | undefined>(undefined);

  const send = useCallback(async () => {
    setSending(true);
    if (deviceTokenRef.current === undefined) deviceTokenRef.current = getDeviceToken();
    const deviceToken = deviceTokenRef.current;
    const { data, error } = await supabase.functions.invoke("otp-send", {
      body: deviceToken ? { device_token: deviceToken } : {},
    });
    setSending(false);
    if (error) {
      setCheckingTrust(false);
      const { message, retryAfter } = await parseError(error, "Could not send code");
      if (retryAfter) setCooldown(retryAfter);
      toast.error("Code not sent", { description: message });
      return;
    }
    const res = data as { trusted?: boolean; clear_device_token?: boolean } | null;
    if (res?.trusted) {
      onVerified(); // sinadya: hindi sine-set ang checkingTrust sa false, para walang flash
      return;
    }
    if (res?.clear_device_token) clearDeviceToken();
    deviceTokenRef.current = null; // nacheck na ng server, hindi na isasama sa resend
    setCheckingTrust(false);
    setCooldown(60);
    toast.success("Code sent", { description: "Check the NurseVault admin inbox." });
  }, [onVerified]);

  useEffect(() => {
    if (sentOnce.current) return;
    sentOnce.current = true;
    void send();
  }, [send]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const verify = async (value: string) => {
    if (busy || value.length !== 6) return;
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("otp-verify", {
      body: { code: value },
    });
    setBusy(false);
    if (error) {
      const { message } = await parseError(error, "Verification failed");
      toast.error("Verification failed", { description: message });
      setCode("");
      return;
    }
    const token = (data as { deviceToken?: string } | null)?.deviceToken;
    if (token) storeDeviceToken(token);
    onVerified();
  };

  if (checkingTrust) return <DeviceVerifyLoader />;

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-surface px-4 py-10">
      <div className="relative w-full max-w-md">
        <div className="mb-6 flex flex-col items-center text-center">
          <img src={seal} alt="PLM College of Nursing seal" className="h-20 w-20 object-contain" />
          <h1 className="mt-3 text-2xl font-semibold tracking-tight text-primary">NurseVault</h1>
        </div>
        <div className="vault-card p-7">
          <div className="mb-6 h-1 w-14 rounded-full bg-gold" />
          <h2 className="text-lg font-semibold text-foreground">Two-step verification</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Enter the 6-digit code sent to the NurseVault admin email. It expires in 10 minutes.
          </p>

          <div className="mt-6 flex justify-center">
            <InputOTP
              maxLength={6}
              value={code}
              onChange={setCode}
              onComplete={verify}
              disabled={busy}
            >
              <InputOTPGroup>
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <InputOTPSlot key={i} index={i} />
                ))}
              </InputOTPGroup>
            </InputOTP>
          </div>

          <Button
            onClick={() => verify(code)}
            disabled={busy || code.length !== 6}
            className="mt-6 h-11 w-full rounded-xl bg-primary text-primary-foreground hover:bg-secondary"
          >
            {busy ? "Verifying…" : "Verify"}
          </Button>

          <div className="mt-4 flex items-center justify-between text-sm">
            <button
              type="button"
              onClick={send}
              disabled={sending || cooldown > 0}
              className="text-primary hover:underline disabled:cursor-not-allowed disabled:text-muted-foreground disabled:no-underline"
            >
              {cooldown > 0 ? `Resend code in ${cooldown}s` : "Resend code"}
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
