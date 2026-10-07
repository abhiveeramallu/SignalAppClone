"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { ApiError } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";

type Step = "details" | "otp";

export function RegisterForm() {
  const { requestOtp, verifyOtpAndRegister, login } = useAuth();
  const router = useRouter();

  const [step, setStep] = useState<Step>("details");

  const [username, setUsername] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [otp, setOtp] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "requestingOtp" | "verifying" | "created">("idle");

  async function handleContinue(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (!username.trim() || !displayName.trim() || password.length < 8) {
      setError("Please fill in all required fields (password must be at least 8 characters).");
      return;
    }

    setStatus("requestingOtp");
    try {
      // Mock "send OTP" step (assignment-permitted fixed code) — demonstrates
      // the two-step flow without any real SMS infrastructure behind it.
      await requestOtp({
        username: username.trim(),
        phone_number: phoneNumber.trim() || undefined,
      });
      setOtp("");
      setStep("otp");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setStatus("idle");
    }
  }

  async function handleVerify(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (!otp.trim()) {
      setError("Enter the verification code.");
      return;
    }

    setStatus("verifying");
    try {
      await verifyOtpAndRegister({
        username: username.trim(),
        phone_number: phoneNumber.trim() || null,
        display_name: displayName.trim(),
        password,
        avatar_url: avatarUrl.trim() || null,
        otp: otp.trim(),
      });
    } catch (err) {
      setStatus("idle");
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
      return;
    }

    setStatus("created");
    try {
      // Auto-login with the password still in hand — smoother than a second manual step.
      await login({ username: username.trim(), password });
      // Navigating to "/" happens via the (auth) layout once currentUser is set.
    } catch {
      // Account exists but auto-login failed for some reason — fall back to a manual login.
      router.replace("/login");
    }
  }

  if (step === "otp") {
    return (
      <form
        onSubmit={handleVerify}
        noValidate
        className="space-y-5 rounded-2xl border border-border bg-surface p-8 shadow-sm"
      >
        <div>
          <button
            type="button"
            onClick={() => {
              setStep("details");
              setError(null);
            }}
            className="mb-3 text-sm font-medium text-muted-foreground hover:text-surface-foreground"
          >
            ← Back
          </button>
          <h2 className="text-lg font-semibold text-surface-foreground">Verify your registration</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Phone verification is mocked for this assignment — no real SMS is sent.
          </p>
        </div>

        {error && (
          <p role="alert" className="rounded-lg bg-danger-muted px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}
        {status === "created" && (
          <p role="status" className="rounded-lg bg-success/10 px-3 py-2 text-sm text-success">
            Verified. Creating your account and signing you in...
          </p>
        )}

        <div>
          <label htmlFor="otp" className="mb-1.5 block text-sm font-medium text-muted-foreground">
            Verification code
          </label>
          <input
            id="otp"
            name="otp"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={otp}
            onChange={(e) => setOtp(e.target.value)}
            maxLength={4}
            placeholder="····"
            autoFocus
            className="block w-full rounded-lg border border-transparent bg-input px-3 py-2 text-center text-lg tracking-[0.5em] text-input-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          <p className="mt-1.5 text-xs text-muted-foreground">Demo OTP: 1234</p>
        </div>

        <Button type="submit" loading={status === "verifying"} className="w-full">
          Verify
        </Button>
      </form>
    );
  }

  return (
    <form
      onSubmit={handleContinue}
      noValidate
      className="space-y-5 rounded-2xl border border-border bg-surface p-8 shadow-sm"
    >
      <div>
        <h2 className="text-lg font-semibold text-surface-foreground">Create your account</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Join with a username — no real phone verification required.
        </p>
      </div>

      {error && (
        <p role="alert" className="rounded-lg bg-danger-muted px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <TextField
        id="username"
        label="Username"
        autoComplete="username"
        value={username}
        onChange={setUsername}
        required
        minLength={3}
      />
      <TextField
        id="displayName"
        label="Display name"
        autoComplete="name"
        value={displayName}
        onChange={setDisplayName}
        required
      />
      <TextField
        id="phoneNumber"
        label="Phone number (optional)"
        autoComplete="tel"
        value={phoneNumber}
        onChange={setPhoneNumber}
      />
      <TextField
        id="password"
        label="Password"
        type="password"
        autoComplete="new-password"
        value={password}
        onChange={setPassword}
        required
        minLength={8}
      />
      <TextField
        id="avatarUrl"
        label="Avatar URL (optional)"
        autoComplete="off"
        value={avatarUrl}
        onChange={setAvatarUrl}
      />

      <Button type="submit" loading={status === "requestingOtp"} className="w-full">
        Continue
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-primary hover:opacity-80">
          Sign in
        </Link>
      </p>
    </form>
  );
}
