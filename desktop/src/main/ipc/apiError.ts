/** 主进程内的业务错误：通过 IPC 传递到渲染层时只包含 code 与 message。 */
export class ApiError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }

  static badRequest(message: string): ApiError {
    return new ApiError('BAD_REQUEST', message);
  }

  static notFound(message: string): ApiError {
    return new ApiError('NOT_FOUND', message);
  }
}
