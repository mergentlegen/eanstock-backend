const { ApiError } = require("../utils/errors");

function notFoundHandler(req, _res, next) {
  next(new ApiError(404, "NOT_FOUND", `Route ${req.method} ${req.path} not found`));
}

function errorHandler(err, _req, res, _next) {
  if (err.name === "ZodError") {
    return res.status(422).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Request validation failed",
        details: err.issues,
      },
    });
  }

  if (err.code === "P2002") {
    return res.status(409).json({
      error: {
        code: "CONFLICT",
        message: "Unique constraint violation",
        details: err.meta,
      },
    });
  }

  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
        details: err.details,
      },
    });
  }

  console.error(err);
  return res.status(500).json({
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message: "Unexpected server error",
      details: null,
    },
  });
}

module.exports = { notFoundHandler, errorHandler };
