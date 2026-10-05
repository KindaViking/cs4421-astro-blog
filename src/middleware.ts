import { defineMiddleware } from 'astro:middleware';

export const onRequest = defineMiddleware(async (context, next) => {
  const start = Date.now();
  const response = await next();

  console.log(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level: response.status >= 500 ? 'ERROR' : 'INFO',
      route: new URL(context.request.url).pathname,
      method: context.request.method,
      statusCode: response.status,
      latencyMs: Date.now() - start,
    })
  );

  return response;
});
