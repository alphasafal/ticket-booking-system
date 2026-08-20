import { NextRequest } from "next/server";
import { authenticate } from "@/lib/auth/auth-service";
import { setSessionCookie } from "@/lib/auth/session";
import { loginSchema } from "@/lib/validation/auth";
import { jsonError, jsonOk } from "@/lib/utils/api-response";

export async function POST(request: NextRequest) {
  try {
    const body = loginSchema.parse(await request.json());
    const user = await authenticate(body);

    const response = jsonOk({ user });
    setSessionCookie(response, user.id);
    return response;
  } catch (error) {
    return jsonError(error);
  }
}
