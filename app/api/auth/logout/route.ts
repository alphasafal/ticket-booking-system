import { clearSessionCookie } from "@/lib/auth/session";
import { jsonOk } from "@/lib/utils/api-response";

export async function POST() {
  const response = jsonOk({ success: true });
  clearSessionCookie(response);
  return response;
}
