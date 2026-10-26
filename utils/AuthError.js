export class AuthError extends Error {
  constructor({
    message = "Unauthorized",
    statusCode = 401,
    code = "UNAUTHORIZED",
  }) {
    super(message);

    this.statusCode = statusCode;
    this.code = code;
    this.status = "fail";
    this.isOperational = true;
    this.name = "AuthError";

    Error.captureStackTrace(this, this.constructor);
  }
}
