"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { primaryButtonClass, errorTextClass } from "@/components/ui/styles";

export function AcceptOfferButton({ entryId }: { entryId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAccept() {
    setPending(true);
    setError(null);
    const res = await fetch(`/api/waitlist/${entryId}/accept`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idempotencyKey: crypto.randomUUID() }),
    });
    const data = await res.json();
    setPending(false);

    if (!res.ok) {
      setError(data.error?.message ?? "Could not accept this offer.");
      return;
    }
    router.push(`/booking/${data.booking.id}`);
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button onClick={handleAccept} disabled={pending} className={primaryButtonClass}>
        {pending ? "Accepting…" : "Accept seat"}
      </button>
      {error && <p className={errorTextClass}>{error}</p>}
    </div>
  );
}
