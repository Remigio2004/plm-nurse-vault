import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import seal from "@/assets/Nursing logo.png";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

  const handleSendReset = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password?step=reset`,
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

  // Handle URL params for the reset step
  const urlParams = new URLSearchParams(window.location.search);
  if (step === "email" && urlParams.get("step") === "reset") {
    setStep("reset");
  }

  if (step === "success") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Password Reset</h1>
          <p className="mt-2 text-muted-foreground">
            Your password has been reset. Redirecting to login...
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
            <img
              src={seal}
              alt="PLM College of Nursing seal"
              className="h-16 w-16"
            />
            <h1 className="mt-2 text-xl font-semibold">Reset Password</h1>
          </div>
          <form onSubmit={handleResetPassword} className="space-y-4">
            <div>
              <Label htmlFor="newPassword" className="text-sm font-medium">
                New Password
              </Label>
              <Input
                id="newPassword"
                type="password"
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="confirmPassword" className="text-sm font-medium">
                Confirm Password
              </Label>
              <Input
                id="confirmPassword"
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full">
              Reset Password
            </Button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface px-4">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center text-center">
          <img
            src={seal}
            alt="PLM College of Nursing seal"
            className="h-16 w-16"
          />
          <h1 className="mt-2 text-xl font-semibold">Forgot Password</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Enter your email to receive a reset link
          </p>
        </div>
        <form onSubmit={handleSendReset} className="space-y-4">
          <div>
            <Label htmlFor="email" className="text-sm font-medium">Email</Label>
            <Input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <Button type="submit" className="w-full">
            Send Reset Link
          </Button>
        </form>
        <div className="mt-4 text-center">
          <a
            href="/"
            className="text-sm text-muted-foreground hover:text-primary hover:underline"
          >
            Back to login
          </a>
        </div>
      </div>
    </div>
  );
}