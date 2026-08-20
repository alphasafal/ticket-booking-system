"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { errorTextClass, inputClass, labelClass, secondaryButtonClass } from "@/components/ui/styles";

export function AddSeatRowForm({ venueId }: { venueId: string }) {
  const router = useRouter();
  const [row, setRow] = useState("");
  const [count, setCount] = useState("8");
  const [category, setCategory] = useState<"PREMIUM" | "STANDARD">("STANDARD");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);

    const seats = Array.from({ length: Number(count) }, (_, i) => ({ row, number: i + 1, category }));
    const res = await fetch(`/api/venues/${venueId}/seats`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ seats }),
    });
    const data = await res.json();
    setPending(false);

    if (!res.ok) {
      setError(data.error?.message ?? "Could not add seats.");
      return;
    }
    setRow("");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3 border-t border-zinc-200 pt-4 dark:border-zinc-800">
      <div>
        <label className={labelClass}>Row letter</label>
        <input required maxLength={2} className={`${inputClass} w-20`} value={row} onChange={(e) => setRow(e.target.value.toUpperCase())} />
      </div>
      <div>
        <label className={labelClass}>Seat count</label>
        <input type="number" min="1" max="50" className={`${inputClass} w-24`} value={count} onChange={(e) => setCount(e.target.value)} />
      </div>
      <div>
        <label className={labelClass}>Category</label>
        <select className={`${inputClass} w-32`} value={category} onChange={(e) => setCategory(e.target.value as "PREMIUM" | "STANDARD")}>
          <option value="STANDARD">Standard</option>
          <option value="PREMIUM">Premium</option>
        </select>
      </div>
      <button type="submit" disabled={pending} className={secondaryButtonClass}>
        {pending ? "Adding…" : "Add row"}
      </button>
      {error && <p className={errorTextClass}>{error}</p>}
    </form>
  );
}
