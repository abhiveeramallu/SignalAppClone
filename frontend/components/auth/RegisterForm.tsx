"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { ApiError } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";

export function RegisterForm() {
  const { register, login } = useAuth();
  const router = useRouter();

  const [username, setUsername] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "submitting" | "created">("idle");

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setStatus("submitting");

    try {
      await register({
        username: username.trim(),
        phone_number: phoneNumber.trim() || null,
        display_name: displayName.trim(),
        password,
        avatar_url: avatarUrl.trim() || null,
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

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="space-y-5 rounded-2xl border border-neutral-200 bg-white p-8 shadow-sm"
    >
      <div>
        <h2 className="text-lg font-semibold text-neutral-900">Create your account</h2>
        <p className="mt-1 text-sm text-neutral-500">
          Join with a username — no real phone verification required.
        </p>
      </div>

      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      {status === "created" && (
        <p role="status" className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">
          Account created. Signing you in...
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

      <Button type="submit" loading={status === "submitting"} className="w-full">
        Create account
      </Button>

      <p className="text-center text-sm text-neutral-500">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-blue-600 hover:text-blue-700">
          Sign in
        </Link>
      </p>
    </form>
  );
}
