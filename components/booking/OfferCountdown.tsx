"use client";

import { useEffect, useState } from "react";

function format(msRemaining: number): string {
  const totalSeconds = Math.max(0, Math.floor(msRemaining / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

// Display only — the offer's real deadline is offerExpiresAt in the database,
// re-checked server-side on every acceptance attempt.
export function OfferCountdown({ expiresAt }: { expiresAt: string }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);

  const msRemaining = new Date(expiresAt).getTime() - now;
  const expired = msRemaining <= 0;

  return (
    <div
      className={`mb-4 rounded-md p-3 text-center text-sm font-medium ${
        expired
          ? "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300"
          : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
      }`}
      role="status"
      aria-live="polite"
    >
      {expired ? "This offer has expired" : `Offer expires in ${format(msRemaining)}`}
    </div>
  );
}
