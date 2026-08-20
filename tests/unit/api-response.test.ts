import { describe, it, expect } from "vitest";
import { z } from "zod";
import { jsonError } from "@/lib/utils/api-response";
import { ApiError } from "@/lib/utils/api-error";

describe("jsonError", () => {
  it("maps a known ApiError to its status and code", async () => {
    const response = jsonError(new ApiError("SEAT_UNAVAILABLE", "taken"));
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body).toEqual({ error: { code: "SEAT_UNAVAILABLE", message: "taken" } });
  });

  it("maps a ZodError to 422 VALIDATION_ERROR", async () => {
    const result = z.object({ name: z.string() }).safeParse({});
    const response = jsonError(result.error);
    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("maps malformed JSON (a SyntaxError) to 422, not 500", async () => {
    let error: unknown;
    try {
      JSON.parse("{not valid json");
    } catch (e) {
      error = e;
    }
    const response = jsonError(error);
    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("never leaks internal error details for an unexpected error", async () => {
    const response = jsonError(new Error("leaked db password: hunter2"));
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error.code).toBe("INTERNAL_ERROR");
    expect(JSON.stringify(body)).not.toContain("hunter2");
  });
});
