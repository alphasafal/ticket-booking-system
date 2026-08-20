"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { cardClass, errorTextClass, inputClass, labelClass, primaryButtonClass } from "@/components/ui/styles";

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"CUSTOMER" | "ORGANISER">("CUSTOMER");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);

    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password, role }),
    });
    const data = await res.json();
    setPending(false);

    if (!res.ok) {
      setError(data.error?.message ?? "Something went wrong.");
      return;
    }
    router.push(role === "ORGANISER" ? "/organiser/dashboard" : "/events");
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-sm">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Create an account</h1>
      <form onSubmit={handleSubmit} className={`${cardClass} flex flex-col gap-4`}>
        <div>
          <label htmlFor="name" className={labelClass}>Name</label>
          <input id="name" required className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label htmlFor="email" className={labelClass}>Email</label>
          <input id="email" type="email" required className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <label htmlFor="password" className={labelClass}>Password</label>
          <input
            id="password"
            type="password"
            required
            minLength={8}
            className={inputClass}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <div>
          <span className={labelClass}>I am a</span>
          <div className="flex gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input type="radio" name="role" checked={role === "CUSTOMER"} onChange={() => setRole("CUSTOMER")} />
              Customer
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" name="role" checked={role === "ORGANISER"} onChange={() => setRole("ORGANISER")} />
              Organiser
            </label>
          </div>
        </div>
        {error && <p className={errorTextClass}>{error}</p>}
        <button type="submit" disabled={pending} className={primaryButtonClass}>
          {pending ? "Creating account…" : "Create account"}
        </button>
      </form>
      <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-zinc-950 hover:underline dark:text-zinc-50">
          Sign in
        </Link>
      </p>
    </div>
  );
}
