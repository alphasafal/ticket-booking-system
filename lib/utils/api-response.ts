import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { ApiError } from "./api-error";

export function jsonOk<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}

// Central error → HTTP response mapping so every route returns the same
// shape and never leaks internals (stack traces, SQL errors) to the client.
export function jsonError(error: unknown): NextResponse {
  if (error instanceof ApiError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message } },
      { status: error.status },
    );
  }

  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: error.issues.map((issue) => issue.message).join("; "),
        },
      },
      { status: 422 },
    );
  }

  // request.json() throws a plain SyntaxError on malformed JSON — that's a
  // client mistake, not a server fault, so it gets a 422 like any other
  // invalid input rather than a generic 500.
  if (error instanceof SyntaxError) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Request body must be valid JSON." } },
      { status: 422 },
    );
  }

  console.error("Unhandled API error:", error);
  return NextResponse.json(
    { error: { code: "INTERNAL_ERROR", message: "Something went wrong." } },
    { status: 500 },
  );
}
