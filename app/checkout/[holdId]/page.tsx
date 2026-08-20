"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { formatINR } from "@/lib/utils/currency";
import { SEAT_MAP_POLL_INTERVAL_MS } from "@/lib/config/booking";
import { cardClass, errorTextClass, primaryButtonClass, secondaryButtonClass } from "@/components/ui/styles";

interface HeldSeat {
  eventSeatId: string;
  row: string;
  number: number;
  category: "PREMIUM" | "STANDARD";
}

interface EventInfo {
  title: string;
  venue: { name: string };
  categoryPrices: { category: "PREMIUM" | "STANDARD"; priceMinorUnits: number }[];
}

function formatCountdown(msRemaining: number): string {
  const totalSeconds = Math.max(0, Math.floor(msRemaining / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export default function CheckoutPage() {
  const router = useRouter();
  const params = useParams<{ holdId: string }>();
  const searchParams = useSearchParams();
  const eventId = searchParams.get("eventId") ?? "";
  const expiresAt = searchParams.get("expiresAt") ?? "";
  const holdToken = params.holdId;

  const [heldSeats, setHeldSeats] = useState<HeldSeat[] | null>(null);
  const [event, setEvent] = useState<EventInfo | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const idempotencyKey = useRef(crypto.randomUUID());

  const expiresAtMs = useMemo(() => new Date(expiresAt).getTime(), [expiresAt]);
  const msRemaining = expiresAtMs - now;
  const isExpired = msRemaining <= 0;

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);

  const fetchHeldSeats = useCallback(async () => {
    const res = await fetch(`/api/events/${eventId}/seats`, { cache: "no-store" });
    if (!res.ok) return;
    const data = await res.json();
    setHeldSeats(
      data.seats.filter(
        (s: { heldByCurrentUser: boolean; holdToken: string | null }) =>
          s.heldByCurrentUser && s.holdToken === holdToken,
      ),
    );
  }, [eventId, holdToken]);

  useEffect(() => {
    fetch(`/api/events/${eventId}`, { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => setEvent(data.event));
  }, [eventId]);

  useEffect(() => {
    if (!eventId) return;
    // Keeps the held-seat list current if the hold is (or is about to be)
    // reconciled server-side — mirrors the seat map's own polling.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchHeldSeats();
    const interval = setInterval(fetchHeldSeats, SEAT_MAP_POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [eventId, fetchHeldSeats]);

  const priceByCategory = useMemo(
    () => new Map((event?.categoryPrices ?? []).map((p) => [p.category, p.priceMinorUnits])),
    [event],
  );
  const totalMinorUnits = (heldSeats ?? []).reduce(
    (sum, s) => sum + (priceByCategory.get(s.category) ?? 0),
    0,
  );

  async function handleConfirm() {
    setError(null);
    setPending(true);
    const res = await fetch(`/api/events/${eventId}/checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ holdToken, idempotencyKey: idempotencyKey.current }),
    });
    const data = await res.json();
    setPending(false);

    if (!res.ok) {
      setError(data.error?.message ?? "Could not confirm your booking.");
      return;
    }
    router.push(`/booking/${data.booking.id}`);
  }

  if (!heldSeats || !event) {
    return <p className="text-sm text-zinc-500">Loading your hold…</p>;
  }

  if (heldSeats.length === 0) {
    return (
      <div className={`${cardClass} mx-auto max-w-md text-center`}>
        <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
          We couldn&apos;t find an active hold for this checkout. It may have expired.
        </p>
        <a href={`/events/${eventId}`} className={secondaryButtonClass}>
          Back to event
        </a>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md">
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">Checkout</h1>
      <p className="mb-6 text-sm text-zinc-600 dark:text-zinc-400">
        {event.title} · {event.venue.name}
      </p>

      <div className={cardClass}>
        <div className={`mb-4 rounded-md p-3 text-center text-sm font-medium ${isExpired ? "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300" : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"}`}>
          {isExpired ? "Your hold has expired" : `Seats held for ${formatCountdown(msRemaining)}`}
        </div>

        <ul className="mb-4 flex flex-col gap-1 text-sm">
          {heldSeats.map((s) => (
            <li key={s.eventSeatId} className="flex justify-between">
              <span>{s.row}{s.number} ({s.category})</span>
              <span>{formatINR(priceByCategory.get(s.category) ?? 0)}</span>
            </li>
          ))}
        </ul>
        <div className="mb-4 flex justify-between border-t border-zinc-200 pt-3 text-sm font-semibold dark:border-zinc-800">
          <span>Total</span>
          <span>{formatINR(totalMinorUnits)}</span>
        </div>

        {error && <p className={`mb-3 ${errorTextClass}`}>{error}</p>}

        {isExpired ? (
          <a href={`/events/${eventId}`} className={`${primaryButtonClass} block w-full text-center`}>
            Select seats again
          </a>
        ) : (
          <button onClick={handleConfirm} disabled={pending} className={`${primaryButtonClass} w-full`}>
            {pending ? "Confirming…" : "Confirm booking"}
          </button>
        )}
      </div>
    </div>
  );
}
