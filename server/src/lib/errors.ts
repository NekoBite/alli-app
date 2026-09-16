/** An error the client is allowed to see. Anything else becomes a bare 500. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  static badRequest(code: string, message: string) {
    return new ApiError(400, code, message);
  }
  static unauthorized(message = 'Sign in to continue.') {
    return new ApiError(401, 'unauthorized', message);
  }
  static forbidden(code: string, message: string) {
    return new ApiError(403, code, message);
  }
  static notFound(code: string, message: string) {
    return new ApiError(404, code, message);
  }
  static conflict(code: string, message: string) {
    return new ApiError(409, code, message);
  }
  static tooMany(message: string) {
    return new ApiError(429, 'rate_limited', message);
  }
  static unavailable(code: string, message: string) {
    return new ApiError(503, code, message);
  }
}
