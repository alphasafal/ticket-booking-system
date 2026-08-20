import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { listUserBookings } from "@/lib/booking/booking-query-service";
import { getUserWaitlistEntries } from "@/lib/waitlist/waitlist-service";
import { formatINR } from "@/lib/utils/currency";
import { cardClass } from "@/components/ui/styles";
import { AcceptOfferButton } from "@/components/booking/AcceptOfferButton";

export default async function BookingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [bookings, waitlistEntries] = await Promise.all([
    listUserBookings(user.id),
    getUserWaitlistEntries(user.id),
  ]);

  return (
    <div className="flex flex-col gap-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">My bookings</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Your booking history and waitlist status.</p>
      </div>

      {waitlistEntries.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-semibold">Waitlist</h2>
          <div className="flex flex-col gap-3">
            {waitlistEntries.map((entry) => (
              <div key={entry.id} className={`${cardClass} flex items-center justify-between`}>
                <div>
                  <p className="font-medium">{entry.event.title}</p>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">
                    {entry.category} ·{" "}
                    {entry.status === "OFFERED"
                      ? `Offer expires ${entry.offerExpiresAt?.toLocaleTimeString()}`
                      : "Waiting for a seat"}
                  </p>
                </div>
                {entry.status === "OFFERED" && <AcceptOfferButton entryId={entry.id} />}
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-3 text-lg font-semibold">Bookings</h2>
        {bookings.length === 0 ? (
          <p className="text-sm text-zinc-500">You haven&apos;t booked anything yet.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {bookings.map((booking) => (
              <Link
                key={booking.id}
                href={`/booking/${booking.id}`}
                className={`${cardClass} flex items-center justify-between transition-colors hover:border-zinc-400 dark:hover:border-zinc-600`}
              >
                <div>
                  <p className="font-medium">{booking.event.title}</p>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">
                    {booking.reference} · {booking.seats.length} seat{booking.seats.length === 1 ? "" : "s"}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-medium">{formatINR(booking.totalAmountMinorUnits)}</p>
                  <span
                    className={`text-xs font-medium ${
                      booking.status === "CONFIRMED" ? "text-emerald-600 dark:text-emerald-400" : "text-zinc-500"
                    }`}
                  >
                    {booking.status}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
