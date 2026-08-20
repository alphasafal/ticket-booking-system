"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { secondaryButtonClass, errorTextClass } from "@/components/ui/styles";

export function CancelBookingButton({ bookingId }: { bookingId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  async function handleCancel() {
    setPending(true);
    setError(null);
    const res = await fetch(`/api/bookings/${bookingId}/cancel`, { method: "POST" });
    const data = await res.json();
    setPending(false);

    if (!res.ok) {
      setError(data.error?.message ?? "Could not cancel this booking.");
      return;
    }
    router.refresh();
  }

  if (!confirming) {
    return (
      <button onClick={() => setConfirming(true)} className={secondaryButtonClass}>
        Cancel booking
      </button>
    );
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex gap-2">
        <span className="self-center text-sm text-zinc-600 dark:text-zinc-400">Cancel this booking?</span>
        <button onClick={handleCancel} disabled={pending} className={secondaryButtonClass}>
          {pending ? "Cancelling…" : "Yes, cancel"}
        </button>
        <button onClick={() => setConfirming(false)} className={secondaryButtonClass}>
          Keep it
        </button>
      </div>
      {error && <p className={errorTextClass}>{error}</p>}
    </div>
  );
}
