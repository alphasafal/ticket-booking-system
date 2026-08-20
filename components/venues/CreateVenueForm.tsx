"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { cardClass, errorTextClass, inputClass, labelClass, primaryButtonClass } from "@/components/ui/styles";

export function CreateVenueForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);

    const res = await fetch("/api/venues", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description: description || undefined }),
    });
    const data = await res.json();
    setPending(false);

    if (!res.ok) {
      setError(data.error?.message ?? "Could not create venue.");
      return;
    }
    setName("");
    setDescription("");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className={`${cardClass} flex flex-col gap-4`}>
      <h2 className="text-lg font-semibold">Create venue</h2>
      <div>
        <label htmlFor="venueName" className={labelClass}>Name</label>
        <input id="venueName" required className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div>
        <label htmlFor="venueDescription" className={labelClass}>Description</label>
        <textarea id="venueDescription" className={inputClass} value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      {error && <p className={errorTextClass}>{error}</p>}
      <button type="submit" disabled={pending} className={primaryButtonClass}>
        {pending ? "Creating…" : "Create venue"}
      </button>
    </form>
  );
}
