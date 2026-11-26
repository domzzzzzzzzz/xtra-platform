export class AppError extends Error {
  constructor(public statusCode: number, public code: string, message: string) {
    super(message);
  }
}
export const notFound = (what = 'Not found') => new AppError(404, 'not_found', what);
export const badRequest = (msg: string, code = 'bad_request') => new AppError(400, code, msg);
export const conflict = (msg: string, code = 'conflict') => new AppError(409, code, msg);
export const forbidden = (msg = 'Not allowed') => new AppError(403, 'forbidden', msg);
