"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { cardClass, errorTextClass, inputClass, labelClass, primaryButtonClass } from "@/components/ui/styles";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);

    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    setPending(false);

    if (!res.ok) {
      setError(data.error?.message ?? "Something went wrong.");
      return;
    }
    router.push("/events");
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-sm">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Sign in</h1>
      <form onSubmit={handleSubmit} className={`${cardClass} flex flex-col gap-4`}>
        <div>
          <label htmlFor="email" className={labelClass}>Email</label>
          <input id="email" type="email" required className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <label htmlFor="password" className={labelClass}>Password</label>
          <input id="password" type="password" required className={inputClass} value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        {error && <p className={errorTextClass}>{error}</p>}
        <button type="submit" disabled={pending} className={primaryButtonClass}>
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </form>
      <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">
        Don&apos;t have an account?{" "}
        <Link href="/register" className="font-medium text-zinc-950 hover:underline dark:text-zinc-50">
          Sign up
        </Link>
      </p>
    </div>
  );
}
