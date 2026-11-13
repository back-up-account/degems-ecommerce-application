import { recordHttpRequest } from '@/lib/metrics';

export function instrumentHttpHandler<Arguments extends unknown[]>(
  route: string,
  method: string,
  handler: (...arguments_: Arguments) => Promise<Response | undefined>,
) {
  return async (...arguments_: Arguments) => {
    const startedAt = performance.now();
    try {
      const response = await handler(...arguments_);
      if (!response) {
        throw new Error(`The ${method} ${route} handler did not return a response.`);
      }
      recordHttpRequest(method, route, response.status, performance.now() - startedAt);
      return response;
    } catch (error) {
      recordHttpRequest(method, route, 500, performance.now() - startedAt);
      throw error;
    }
  };
}
