import { cookies } from "next/headers";
import { prisma } from "@/lib/db/prisma";
import { SESSION_COOKIE_NAME, verifySessionToken } from "./session";

export interface AuthenticatedUser {
  id: string;
  name: string;
  email: string;
  role: "CUSTOMER" | "ORGANISER" | "ADMIN";
}

// Always re-fetches the user row rather than trusting the cookie payload,
// so a role change or account removal takes effect on the very next request.
export async function getCurrentUser(): Promise<AuthenticatedUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;

  const payload = verifySessionToken(token);
  if (!payload) return null;

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { id: true, name: true, email: true, role: true },
  });

  return user;
}
