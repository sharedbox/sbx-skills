import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Request, Response } from 'express';

interface ErrorBody {
  statusCode: number;
  code?: string;
  message: string | string[];
  [key: string]: unknown;
}

/**
 * Last line of defence: known HTTP errors keep their status and body,
 * anything else becomes a generic 500 — stack traces and internals never reach the client.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request & { id?: string }>();
    const response = http.getResponse<Response>();

    let body: ErrorBody;
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const raw = exception.getResponse();
      body =
        typeof raw === 'string'
          ? { statusCode: status, message: raw }
          : { message: exception.message, ...raw, statusCode: status };
      if (status >= 500) this.logger.error(exception);
    } else {
      this.logger.error(exception instanceof Error ? exception.stack : String(exception));
      body = { statusCode: HttpStatus.INTERNAL_SERVER_ERROR, message: 'Internal server error' };
    }

    response.status(body.statusCode).json({ ...body, requestId: request.id });
  }
}
