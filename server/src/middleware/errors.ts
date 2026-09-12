import type { ErrorRequestHandler, RequestHandler } from 'express';
import { UniqueConstraintError } from 'sequelize';
import { ApiError } from '../utils/ApiError.js';

export const notFound: RequestHandler = (request, _response, next) => {
  next(new ApiError(404, 'NOT_FOUND', `接口不存在: ${request.method} ${request.originalUrl}`));
};

export const errorHandler: ErrorRequestHandler = (error: unknown, _request, response, _next) => {
  if (error instanceof ApiError) {
    response.status(error.statusCode).json({
      error: {
        code: error.code,
        message: error.message,
        ...(error.details === undefined ? {} : { details: error.details }),
      },
    });
    return;
  }

  if (error instanceof UniqueConstraintError) {
    response.status(409).json({ error: { code: 'CONFLICT', message: '相同平台下已存在同名账号' } });
    return;
  }

  if (error instanceof SyntaxError && typeof error === 'object' && error !== null && 'body' in error) {
    response.status(400).json({ error: { code: 'INVALID_JSON', message: '请求体不是合法 JSON' } });
    return;
  }

  console.error(error);
  response.status(500).json({ error: { code: 'INTERNAL_ERROR', message: '服务器内部错误' } });
};
