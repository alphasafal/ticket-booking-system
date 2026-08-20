"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function SignOutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleSignOut() {
    setPending(true);
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  return (
    <button
      onClick={handleSignOut}
      disabled={pending}
      className="text-sm font-medium text-zinc-600 hover:text-zinc-950 disabled:opacity-50 dark:text-zinc-400 dark:hover:text-zinc-50"
    >
      Sign out
    </button>
  );
}
