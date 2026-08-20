import { Prisma } from "@prisma/client";

// Serializes concurrent transactions on a logical key that has no dedicated
// unique index (e.g. "one active waitlist entry per user/event/category").
// The lock is held for the lifetime of the transaction and released
// automatically on commit or rollback.
export async function acquireAdvisoryLock(tx: Prisma.TransactionClient, key: string): Promise<void> {
  await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${key}))`);
}
