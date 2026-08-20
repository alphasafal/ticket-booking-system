import { NextRequest } from "next/server";
import { registerUser } from "@/lib/auth/auth-service";
import { setSessionCookie } from "@/lib/auth/session";
import { registerSchema } from "@/lib/validation/auth";
import { jsonError, jsonOk } from "@/lib/utils/api-response";
import { checkRateLimit, clientIp } from "@/lib/utils/rate-limit";

export async function POST(request: NextRequest) {
  try {
    checkRateLimit(`register:${clientIp(request)}`, 5, 60_000);
    const body = registerSchema.parse(await request.json());
    const user = await registerUser(body);

    const response = jsonOk({ user }, 201);
    setSessionCookie(response, user.id);
    return response;
  } catch (error) {
    return jsonError(error);
  }
}
