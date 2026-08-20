"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { cardClass, errorTextClass, inputClass, labelClass, primaryButtonClass } from "@/components/ui/styles";

interface Venue {
  id: string;
  name: string;
}

export function CreateEventForm() {
  const router = useRouter();
  const [venues, setVenues] = useState<Venue[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState("CONCERT");
  const [venueId, setVenueId] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [premiumPrice, setPremiumPrice] = useState("");
  const [standardPrice, setStandardPrice] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    fetch("/api/venues")
      .then((res) => res.json())
      .then((data) => {
        setVenues(data.venues);
        if (data.venues[0]) setVenueId(data.venues[0].id);
      });
  }, []);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);

    const categoryPrices = [
      ...(premiumPrice ? [{ category: "PREMIUM", priceMinorUnits: Math.round(Number(premiumPrice) * 100) }] : []),
      ...(standardPrice ? [{ category: "STANDARD", priceMinorUnits: Math.round(Number(standardPrice) * 100) }] : []),
    ];

    const res = await fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        description: description || undefined,
        type,
        venueId,
        eventDate: new Date(eventDate).toISOString(),
        startTime: new Date(eventDate).toISOString(),
        status: "PUBLISHED",
        categoryPrices,
      }),
    });
    const data = await res.json();
    setPending(false);

    if (!res.ok) {
      setError(data.error?.message ?? "Could not create event.");
      return;
    }
    router.refresh();
    setTitle("");
    setDescription("");
    setEventDate("");
    setPremiumPrice("");
    setStandardPrice("");
  }

  return (
    <form onSubmit={handleSubmit} className={`${cardClass} flex flex-col gap-4`}>
      <h2 className="text-lg font-semibold">Create event</h2>
      <div>
        <label htmlFor="title" className={labelClass}>Title</label>
        <input id="title" required className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div>
        <label htmlFor="description" className={labelClass}>Description</label>
        <textarea id="description" className={inputClass} value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="type" className={labelClass}>Type</label>
          <select id="type" className={inputClass} value={type} onChange={(e) => setType(e.target.value)}>
            <option value="CONCERT">Concert</option>
            <option value="MOVIE">Movie</option>
          </select>
        </div>
        <div>
          <label htmlFor="venue" className={labelClass}>Venue</label>
          <select id="venue" required className={inputClass} value={venueId} onChange={(e) => setVenueId(e.target.value)}>
            {venues.map((venue) => (
              <option key={venue.id} value={venue.id}>{venue.name}</option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label htmlFor="eventDate" className={labelClass}>Date &amp; time</label>
        <input
          id="eventDate"
          type="datetime-local"
          required
          className={inputClass}
          value={eventDate}
          onChange={(e) => setEventDate(e.target.value)}
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="premiumPrice" className={labelClass}>Premium price (₹)</label>
          <input id="premiumPrice" type="number" min="0" className={inputClass} value={premiumPrice} onChange={(e) => setPremiumPrice(e.target.value)} />
        </div>
        <div>
          <label htmlFor="standardPrice" className={labelClass}>Standard price (₹)</label>
          <input id="standardPrice" type="number" min="0" className={inputClass} value={standardPrice} onChange={(e) => setStandardPrice(e.target.value)} />
        </div>
      </div>
      {error && <p className={errorTextClass}>{error}</p>}
      <button type="submit" disabled={pending || !venueId} className={primaryButtonClass}>
        {pending ? "Creating…" : "Create event"}
      </button>
    </form>
  );
}
