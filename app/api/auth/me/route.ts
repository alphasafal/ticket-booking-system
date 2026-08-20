import { getCurrentUser } from "@/lib/auth/current-user";
import { jsonOk } from "@/lib/utils/api-response";

export async function GET() {
  const user = await getCurrentUser();
  return jsonOk({ user });
}
