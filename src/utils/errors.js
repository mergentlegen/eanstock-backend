class ApiError extends Error {
  constructor(statusCode, code, message, details = null) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

const badRequest = (message, details) => new ApiError(400, "BAD_REQUEST", message, details);
const unauthorized = (message = "Authentication required") => new ApiError(401, "UNAUTHORIZED", message);
const forbidden = (message = "Forbidden") => new ApiError(403, "FORBIDDEN", message);
const notFound = (message = "Resource not found") => new ApiError(404, "NOT_FOUND", message);
const conflict = (message, details) => new ApiError(409, "CONFLICT", message, details);
const validation = (message, details) => new ApiError(422, "VALIDATION_ERROR", message, details);

module.exports = {
  ApiError,
  badRequest,
  unauthorized,
  forbidden,
  notFound,
  conflict,
  validation,
};
