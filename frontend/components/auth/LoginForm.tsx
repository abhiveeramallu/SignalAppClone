"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { ApiError } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";

// A loose heuristic: if it looks like a phone number, send it as one.
const PHONE_LIKE = /^\+?[0-9][0-9\s-]{5,}$/;

export function LoginForm() {
  const { login } = useAuth();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const trimmed = identifier.trim();
    const payload = PHONE_LIKE.test(trimmed)
      ? { phone_number: trimmed, password }
      : { username: trimmed, password };

    try {
      await login(payload);
      // Navigating to "/" happens via the (auth) layout once currentUser is set.
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="space-y-5 rounded-2xl border border-border bg-surface p-8 shadow-sm"
    >
      <div>
        <h2 className="text-lg font-semibold text-surface-foreground">Welcome back</h2>
        <p className="mt-1 text-sm text-muted-foreground">Sign in to continue to your conversations.</p>
      </div>

      {error && (
        <p role="alert" className="rounded-lg bg-danger-muted px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <TextField
        id="identifier"
        label="Username or phone number"
        autoComplete="username"
        value={identifier}
        onChange={setIdentifier}
        required
      />
      <TextField
        id="password"
        label="Password"
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={setPassword}
        required
      />

      <Button type="submit" loading={submitting} className="w-full">
        Sign in
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        Don&apos;t have an account?{" "}
        <Link href="/register" className="font-medium text-primary hover:opacity-80">
          Create one
        </Link>
      </p>
    </form>
  );
}
