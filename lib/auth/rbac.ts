import { ApiError } from "@/lib/utils/api-error";
import { getCurrentUser, type AuthenticatedUser } from "./current-user";

export async function requireAuth(): Promise<AuthenticatedUser> {
  const user = await getCurrentUser();
  if (!user) {
    throw new ApiError("UNAUTHORIZED", "You must be signed in to do this.");
  }
  return user;
}

export function requireRole(
  user: AuthenticatedUser,
  allowedRoles: AuthenticatedUser["role"][],
): void {
  if (!allowedRoles.includes(user.role)) {
    throw new ApiError("FORBIDDEN", "You do not have permission to do this.");
  }
}
