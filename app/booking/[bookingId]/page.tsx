import { redirect, notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getOwnedBookingDetail } from "@/lib/booking/booking-query-service";
import { generateBookingQrCode } from "@/lib/qr/qr-service";
import { formatINR } from "@/lib/utils/currency";
import { ApiError } from "@/lib/utils/api-error";
import { CancelBookingButton } from "@/components/booking/CancelBookingButton";
import { cardClass } from "@/components/ui/styles";

export default async function BookingDetailPage({ params }: { params: Promise<{ bookingId: string }> }) {
  const { bookingId } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  let booking;
  try {
    booking = await getOwnedBookingDetail(bookingId, user.id);
  } catch (error) {
    if (error instanceof ApiError && (error.code === "NOT_FOUND" || error.code === "FORBIDDEN")) notFound();
    throw error;
  }

  const qrDataUrl = booking.status === "CONFIRMED" ? await generateBookingQrCode(booking.reference) : null;

  return (
    <div className="mx-auto max-w-md">
      <div className={cardClass}>
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h1 className="text-xl font-semibold">{booking.event.title}</h1>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">{booking.event.venue.name}</p>
          </div>
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
              booking.status === "CONFIRMED"
                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                : "bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
            }`}
          >
            {booking.status}
          </span>
        </div>

        <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
          {booking.event.eventDate.toLocaleString(undefined, { dateStyle: "full", timeStyle: "short" })}
        </p>

        <ul className="mb-4 flex flex-col gap-1 text-sm">
          {booking.seats.map((s) => (
            <li key={s.id} className="flex justify-between">
              <span>
                {s.eventSeat.seat.row}
                {s.eventSeat.seat.number} ({s.eventSeat.seat.category})
              </span>
              <span>{formatINR(s.priceMinorUnits)}</span>
            </li>
          ))}
        </ul>
        <div className="mb-4 flex justify-between border-t border-zinc-200 pt-3 text-sm font-semibold dark:border-zinc-800">
          <span>Total</span>
          <span>{formatINR(booking.totalAmountMinorUnits)}</span>
        </div>

        <div className="mb-4 rounded-md bg-zinc-100 p-3 text-center text-sm font-mono tracking-wide dark:bg-zinc-800">
          {booking.reference}
        </div>

        {qrDataUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={qrDataUrl} alt="Booking QR code" width={180} height={180} className="mx-auto mb-4" />
        )}

        {booking.status === "CONFIRMED" && (
          <div className="flex justify-end">
            <CancelBookingButton bookingId={booking.id} />
          </div>
        )}
        {booking.status === "CANCELLED" && (
          <p className="text-center text-sm text-zinc-500">
            Cancelled {booking.cancelledAt?.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
          </p>
        )}
      </div>
    </div>
  );
}
