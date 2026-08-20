import { NextRequest } from "next/server";
import { authenticate } from "@/lib/auth/auth-service";
import { setSessionCookie } from "@/lib/auth/session";
import { loginSchema } from "@/lib/validation/auth";
import { jsonError, jsonOk } from "@/lib/utils/api-response";
import { checkRateLimit, clientIp } from "@/lib/utils/rate-limit";

export async function POST(request: NextRequest) {
  try {
    await checkRateLimit(`login:${clientIp(request)}`, 10, 60_000);
    const body = loginSchema.parse(await request.json());
    const user = await authenticate(body);

    const response = jsonOk({ user });
    setSessionCookie(response, user.id);
    return response;
  } catch (error) {
    return jsonError(error);
  }
}
