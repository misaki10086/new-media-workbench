import type { RequestHandler } from 'express';
import type { ZodType } from 'zod';
import { ApiError } from '../utils/ApiError.js';

export function validateBody(schema: ZodType): RequestHandler {
  return (request, _response, next) => {
    const result = schema.safeParse(request.body);
    if (!result.success) {
      next(new ApiError(400, 'VALIDATION_ERROR', '请求参数不合法', result.error.flatten()));
      return;
    }
    request.body = result.data;
    next();
  };
}
