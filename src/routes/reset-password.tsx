import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import seal from "@/assets/Nursing logo.png";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Reset Password — NurseVault" },
      { name: "description", content: "Reset your NurseVault password." },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<"email" | "reset" | "success">("email");
  const [email, setEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get("step") === "reset") {
      setStep("reset");
    }
  }, []);

  const handleSendReset = async (e: React.FormEvent) => {
    e.preventDefault();
    const redirectUrl =
      typeof window !== "undefined"
        ? `${window.location.origin}/reset-password?step=reset`
        : "/reset-password?step=reset";
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: redirectUrl,
    });
    if (error) {
      toast.error("Failed to send reset email", { description: error.message });
      return;
    }
    setStep("email");
    toast.success("Reset email sent!");
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      toast.error("Failed to reset password", { description: error.message });
      return;
    }
    setStep("success");
    setTimeout(() => navigate({ to: "/" }), 2000);
  };

  if (step === "success") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface px-4">
        <div className="vault-card p-7 text-center">
          <h1 className="text-2xl font-bold text-foreground">Password Reset Complete</h1>
          <p className="mt-2 text-muted-foreground">
            Your password has been reset by the system. Please log in with your new credentials.
          </p>
        </div>
      </div>
    );
  }

  if (step === "reset") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface px-4">
        <div className="w-full max-w-md">
          <div className="mb-6 flex flex-col items-center text-center">
            <img src={seal} alt="PLM College of Nursing seal" className="h-16 w-16" />
            <h1 className="mt-2 text-xl font-semibold">Reset Password</h1>
          </div>
          <div className="vault-card p-7">
            <TooltipProvider delayDuration={200}>
              <form onSubmit={handleResetPassword} className="space-y-4">
                <div>
                  <Label htmlFor="newPassword" className="text-sm font-medium">
                    New Password
                  </Label>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Input
                        id="newPassword"
                        type="password"
                        required
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="h-11 rounded-xl"
                      />
                    </TooltipTrigger>
                    <TooltipContent>Password must be at least 8 characters</TooltipContent>
                  </Tooltip>
                </div>
                <div>
                  <Label htmlFor="confirmPassword" className="text-sm font-medium">
                    Confirm Password
                  </Label>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Input
                        id="confirmPassword"
                        type="password"
                        required
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="h-11 rounded-xl"
                      />
                    </TooltipTrigger>
                    <TooltipContent>Confirm your new password</TooltipContent>
                  </Tooltip>
                </div>
                <Button type="submit" className="h-11 w-full rounded-xl">
                  Reset Password
                </Button>
              </form>
            </TooltipProvider>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface px-4">
      <div className="vault-card w-full max-w-md p-7">
        <div className="mb-6 flex flex-col items-center text-center">
          <img src={seal} alt="PLM College of Nursing seal" className="h-16 w-16" />
          <h1 className="mt-2 text-xl font-semibold">Forgot Password</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Enter your email to receive a reset link
          </p>
        </div>
        <TooltipProvider delayDuration={200}>
          <form onSubmit={handleSendReset} className="space-y-4">
            <div>
              <Label htmlFor="email" className="text-sm font-medium">
                Email
              </Label>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@plm.edu.ph"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="h-11 rounded-xl"
                  />
                </TooltipTrigger>
                <TooltipContent>Enter your registered email address</TooltipContent>
              </Tooltip>
            </div>
            <Button type="submit" className="h-11 w-full rounded-xl">
              Send Reset Link
            </Button>
          </form>
        </TooltipProvider>
        <div className="mt-4 text-center">
          <a href="/" className="text-sm text-muted-foreground hover:text-primary hover:underline">
            Back to login
          </a>
        </div>
      </div>
    </div>
  );
}
