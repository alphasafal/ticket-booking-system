export type ApiErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "SEAT_UNAVAILABLE"
  | "HOLD_EXPIRED"
  | "HOLD_NOT_FOUND"
  | "HOLD_OWNER_MISMATCH"
  | "DUPLICATE_WAITLIST_ENTRY"
  | "OFFER_EXPIRED"
  | "OFFER_OWNER_MISMATCH"
  | "ALREADY_CANCELLED"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR";

const STATUS_BY_CODE: Record<ApiErrorCode, number> = {
  VALIDATION_ERROR: 422,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  SEAT_UNAVAILABLE: 409,
  HOLD_EXPIRED: 409,
  HOLD_NOT_FOUND: 404,
  HOLD_OWNER_MISMATCH: 403,
  DUPLICATE_WAITLIST_ENTRY: 409,
  OFFER_EXPIRED: 409,
  OFFER_OWNER_MISMATCH: 403,
  ALREADY_CANCELLED: 409,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
};

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;

  constructor(code: ApiErrorCode, message: string) {
    super(message);
    this.code = code;
    this.status = STATUS_BY_CODE[code];
  }
}
