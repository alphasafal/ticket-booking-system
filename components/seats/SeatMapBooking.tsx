"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { SEAT_MAP_POLL_INTERVAL_MS, MAX_SEATS_PER_BOOKING } from "@/lib/config/booking";
import { formatINR } from "@/lib/utils/currency";
import { primaryButtonClass, secondaryButtonClass } from "@/components/ui/styles";
import type { SeatMapEntry } from "@/lib/seat/seat-map-service";

interface CategoryPrice {
  category: "PREMIUM" | "STANDARD";
  priceMinorUnits: number;
}

interface SeatMapBookingProps {
  eventId: string;
  categoryPrices: CategoryPrice[];
  isAuthenticated: boolean;
}

const STATUS_STYLES: Record<string, string> = {
  AVAILABLE: "border-zinc-300 bg-white text-zinc-700 hover:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300",
  HELD: "border-amber-300 bg-amber-100 text-amber-800 cursor-not-allowed dark:border-amber-700 dark:bg-amber-950 dark:text-amber-300",
  BOOKED: "border-zinc-300 bg-zinc-200 text-zinc-500 cursor-not-allowed dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-600",
  SELECTED: "border-indigo-600 bg-indigo-600 text-white",
};

function statusLabel(seat: SeatMapEntry, isSelected: boolean): string {
  if (isSelected) return "•";
  if (seat.status === "HELD") return "H";
  if (seat.status === "BOOKED") return "X";
  return seat.category === "PREMIUM" ? "P" : "S";
}

export function SeatMapBooking({ eventId, categoryPrices, isAuthenticated }: SeatMapBookingProps) {
  const router = useRouter();
  const [seats, setSeats] = useState<SeatMapEntry[] | null>(null);
  const [selectedSeatIds, setSelectedSeatIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [holdPending, setHoldPending] = useState(false);
  const [waitlistMessage, setWaitlistMessage] = useState<string | null>(null);

  const priceByCategory = useMemo(
    () => new Map(categoryPrices.map((p) => [p.category, p.priceMinorUnits])),
    [categoryPrices],
  );

  const fetchSeats = useCallback(async () => {
    const res = await fetch(`/api/events/${eventId}/seats`, { cache: "no-store" });
    if (!res.ok) return;
    const data = await res.json();
    setSeats(data.seats);
    // Drop any selection that's no longer AVAILABLE (someone else took it).
    setSelectedSeatIds((prev) => {
      const stillAvailable = new Set(
        data.seats.filter((s: SeatMapEntry) => s.status === "AVAILABLE").map((s: SeatMapEntry) => s.seatId),
      );
      return new Set([...prev].filter((id) => stillAvailable.has(id)));
    });
  }, [eventId]);

  useEffect(() => {
    // Polling an external system (the seat map) and setting state from its
    // response in a callback is exactly what effects are for; the lint rule
    // flags the immediate call, not the pattern itself.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchSeats();
    const interval = setInterval(fetchSeats, SEAT_MAP_POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchSeats]);

  function toggleSeat(seat: SeatMapEntry) {
    if (seat.status !== "AVAILABLE") return;
    setSelectedSeatIds((prev) => {
      const next = new Set(prev);
      if (next.has(seat.seatId)) {
        next.delete(seat.seatId);
      } else if (next.size < MAX_SEATS_PER_BOOKING) {
        next.add(seat.seatId);
      }
      return next;
    });
  }

  async function handleHold() {
    setError(null);
    setHoldPending(true);
    const res = await fetch(`/api/events/${eventId}/hold`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ seatIds: Array.from(selectedSeatIds) }),
    });
    const data = await res.json();
    setHoldPending(false);

    if (!res.ok) {
      setError(data.error?.message ?? "Could not hold those seats.");
      await fetchSeats();
      setSelectedSeatIds(new Set());
      return;
    }

    const params = new URLSearchParams({ eventId, expiresAt: data.hold.expiresAt });
    router.push(`/checkout/${data.hold.holdToken}?${params.toString()}`);
  }

  async function handleJoinWaitlist(category: "PREMIUM" | "STANDARD") {
    setWaitlistMessage(null);
    const res = await fetch(`/api/events/${eventId}/waitlist`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category }),
    });
    const data = await res.json();
    setWaitlistMessage(
      res.ok ? `You're on the ${category.toLowerCase()} waitlist.` : data.error?.message ?? "Could not join the waitlist.",
    );
  }

  if (!seats) {
    return <div className="animate-pulse text-sm text-zinc-500">Loading seat map…</div>;
  }

  const rows = [...new Set(seats.map((s) => s.row))].sort();
  const soldOutCategories = (["PREMIUM", "STANDARD"] as const).filter(
    (category) =>
      seats.some((s) => s.category === category) &&
      !seats.some((s) => s.category === category && s.status === "AVAILABLE"),
  );

  const selectedSeats = seats.filter((s) => selectedSeatIds.has(s.seatId));
  const totalMinorUnits = selectedSeats.reduce((sum, s) => sum + (priceByCategory.get(s.category as "PREMIUM" | "STANDARD") ?? 0), 0);

  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      <div className="flex-1">
        <div className="mb-6 rounded border border-dashed border-zinc-300 py-2 text-center text-xs uppercase tracking-widest text-zinc-500 dark:border-zinc-700">
          Screen / Stage
        </div>

        <div className="mb-4 flex flex-wrap gap-4 text-xs text-zinc-600 dark:text-zinc-400">
          <span className="flex items-center gap-1.5"><span className={`flex h-5 w-5 items-center justify-center rounded border text-[10px] ${STATUS_STYLES.AVAILABLE}`}>P</span> Available</span>
          <span className="flex items-center gap-1.5"><span className={`flex h-5 w-5 items-center justify-center rounded border text-[10px] ${STATUS_STYLES.SELECTED}`}>•</span> Selected</span>
          <span className="flex items-center gap-1.5"><span className={`flex h-5 w-5 items-center justify-center rounded border text-[10px] ${STATUS_STYLES.HELD}`}>H</span> Held</span>
          <span className="flex items-center gap-1.5"><span className={`flex h-5 w-5 items-center justify-center rounded border text-[10px] ${STATUS_STYLES.BOOKED}`}>X</span> Booked</span>
        </div>

        <div className="flex flex-col gap-2 overflow-x-auto">
          {rows.map((row) => (
            <div key={row} className="flex items-center gap-2">
              <span className="w-5 shrink-0 text-xs text-zinc-500">{row}</span>
              <div className="flex flex-wrap gap-1.5">
                {seats
                  .filter((s) => s.row === row)
                  .sort((a, b) => a.number - b.number)
                  .map((seat) => {
                    const isSelected = selectedSeatIds.has(seat.seatId);
                    const style = isSelected ? STATUS_STYLES.SELECTED : STATUS_STYLES[seat.status];
                    return (
                      <button
                        key={seat.eventSeatId}
                        type="button"
                        onClick={() => toggleSeat(seat)}
                        disabled={seat.status !== "AVAILABLE" && !isSelected}
                        aria-label={`Seat ${row}${seat.number}, ${seat.category.toLowerCase()}, ${isSelected ? "selected" : seat.status.toLowerCase()}`}
                        title={`${row}${seat.number} · ${seat.category}`}
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded border text-xs font-medium transition-colors ${style}`}
                      >
                        {statusLabel(seat, isSelected)}
                      </button>
                    );
                  })}
              </div>
            </div>
          ))}
        </div>

        {soldOutCategories.length > 0 && (
          <div className="mt-6 flex flex-col gap-2 rounded-md border border-zinc-200 p-4 text-sm dark:border-zinc-800">
            <p className="font-medium">Sold out categories</p>
            {soldOutCategories.map((category) => (
              <div key={category} className="flex items-center justify-between">
                <span>{category}</span>
                {isAuthenticated ? (
                  <button onClick={() => handleJoinWaitlist(category)} className={secondaryButtonClass}>
                    Join waitlist
                  </button>
                ) : (
                  <span className="text-zinc-500">Sign in to join the waitlist</span>
                )}
              </div>
            ))}
            {waitlistMessage && <p className="text-zinc-600 dark:text-zinc-400">{waitlistMessage}</p>}
          </div>
        )}
      </div>

      <aside className="w-full shrink-0 lg:w-72">
        <div className="sticky top-6 rounded-lg border border-zinc-200 p-5 dark:border-zinc-800">
          <h3 className="mb-3 text-sm font-semibold">Your selection</h3>
          {selectedSeats.length === 0 ? (
            <p className="text-sm text-zinc-500">No seats selected yet.</p>
          ) : (
            <ul className="mb-4 flex flex-col gap-1 text-sm">
              {selectedSeats.map((s) => (
                <li key={s.eventSeatId} className="flex justify-between">
                  <span>{s.row}{s.number} ({s.category})</span>
                  <span>{formatINR(priceByCategory.get(s.category as "PREMIUM" | "STANDARD") ?? 0)}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="mb-4 flex justify-between border-t border-zinc-200 pt-3 text-sm font-semibold dark:border-zinc-800">
            <span>Total</span>
            <span>{formatINR(totalMinorUnits)}</span>
          </div>
          {error && <p className="mb-3 text-sm text-red-600 dark:text-red-400">{error}</p>}
          {isAuthenticated ? (
            <button
              onClick={handleHold}
              disabled={selectedSeats.length === 0 || holdPending}
              className={`${primaryButtonClass} w-full`}
            >
              {holdPending ? "Holding…" : "Hold seats"}
            </button>
          ) : (
            <a href="/login" className={`${primaryButtonClass} block w-full text-center`}>
              Sign in to book
            </a>
          )}
        </div>
      </aside>
    </div>
  );
}
