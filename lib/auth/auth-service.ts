import { prisma } from "@/lib/db/prisma";
import { ApiError } from "@/lib/utils/api-error";
import type { LoginInput, RegisterInput } from "@/lib/validation/auth";
import { hashPassword, verifyPassword } from "./password";
import type { AuthenticatedUser } from "./current-user";

export async function registerUser(input: RegisterInput): Promise<AuthenticatedUser> {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) {
    throw new ApiError("VALIDATION_ERROR", "An account with this email already exists.");
  }

  const passwordHash = await hashPassword(input.password);
  const user = await prisma.user.create({
    data: {
      name: input.name,
      email: input.email,
      passwordHash,
      role: input.role,
    },
    select: { id: true, name: true, email: true, role: true },
  });

  return user;
}

export async function authenticate(input: LoginInput): Promise<AuthenticatedUser> {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  if (!user) {
    throw new ApiError("UNAUTHORIZED", "Invalid email or password.");
  }

  const valid = await verifyPassword(input.password, user.passwordHash);
  if (!valid) {
    throw new ApiError("UNAUTHORIZED", "Invalid email or password.");
  }

  return { id: user.id, name: user.name, email: user.email, role: user.role };
}
