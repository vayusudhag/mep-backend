import AppError from "../utils/AppError.js";

const sendErrorDev = (err, res) => {
  res.status(err.statusCode || 500).json({
    status: err.status || "error",
    message: err.message,
    code: err.code, // 👈 expose in dev
    stack: err.stack,
  });
};

const sendErrorProd = (err, res) => {
  // CONTRACT / AUTH ERRORS
  if (err.code) {
    return res.status(err.statusCode || 401).json({
      status: err.status || "fail",
      code: err.code,
      message: err.message || "Unauthorized",
    });
  }

  // OPERATIONAL ERRORS
  if (err.isOperational) {
    return res.status(err.statusCode).json({
      status: err.status,
      message: err.message,
    });
  }

  // PROGRAMMING / UNKNOWN ERRORS
  console.error("🔥 ERROR:", err);

  res.status(500).json({
    status: "error",
    message: "Something went wrong",
  });
};

const handleMongooseValidationError = (err) => {
  const messages = Object.values(err.errors || {}).map((e) => e.message);
  return new AppError(messages.join(", ") || "Validation failed", 400);
};

const handleDuplicateKeyError = (err) => {
  const fields = Object.keys(err.keyValue || {});
  const message =
    fields.length > 0
      ? `${fields.join(", ")} already exists`
      : "Duplicate value found";
  return new AppError(message, 409);
};

const normalizeError = (err) => {
  if (err?.name === "ValidationError") {
    return handleMongooseValidationError(err);
  }

  if (err?.code === 11000) {
    return handleDuplicateKeyError(err);
  }

  return err;
};

export const globalErrorHandler = (err, req, res, next) => {
  const normalizedError = normalizeError(err);
  normalizedError.statusCode ||= 500;
  normalizedError.status ||= "error";

  if (process.env.NODE_ENV === "development") {
    sendErrorDev(normalizedError, res);
  } else {
    sendErrorProd(normalizedError, res);
  }
};
