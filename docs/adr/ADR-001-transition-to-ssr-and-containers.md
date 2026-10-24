# ADR-001: Transition from Static Site to Containerized SSR Runtime

## Status

Accepted (2026-10-05)

## Context

The site was first built as a static site (SSG) and served from S3 behind CloudFront. The platform now requires dynamic API endpoints:

- `/api/health`, so the hosting platform can check the app is running
- `/api/satellites/[group]`, which fetches and caches orbital data from CelesTrak for the satellite tracker

The home page also shows live data from NASA and NOAA, which should be fetched on the server so API keys never reach the browser.

Static hosting on S3 cannot execute server-side Node.js code, so none of this can work there.

### How the two approaches compare

| | Static site (SSG) on S3 + CloudFront | Server-side rendering (SSR) in a container |
|---|---|---|
| Server code and API routes | Not possible | Supported |
| Health checks | None: there is no server to check | `/api/health`, used by the load balancer |
| Live data | Only as fresh as the last build | Fetched per request, with caching |
| API keys | Used at build time or exposed to the browser | Kept on the server |
| Speed | Very fast: pre-built files from a CDN | Rendered per request; still fast, but limited by the server |
| Cost | Very low | Always-on compute and a load balancer |
| Scaling | Effectively unlimited through the CDN | Limited per server; scale by adding tasks |
| Security | No server to attack | A server and its dependencies to keep patched |
| Operations | Almost nothing to monitor | Needs health checks, logging, alarms and rollback |

### Options considered

1. **Stay static, and move the API routes to separate serverless functions.** Keeps the cheap, fast static site, but splits the project into two things to build, deploy and monitor, and the browser would call the functions across origins, which needs CORS.
2. **Hybrid: prerender most pages, server-render only what must be dynamic.** Astro supports this per page. It still needs a server for the API routes and the home page, so it doesn't remove the runtime, and it was deferred to keep the first move simple.
3. **Full SSR in a container.** One app, one image, one deploy. Every route can run server code.

## Decision

Option 3. We will configure Astro with the `@astrojs/node` adapter in standalone mode (`output: 'server'`) and package the application as a Docker container, using a multi-stage build so the production image contains only the build output and its runtime dependencies.

Where the container runs is decided in ADR-002.

## Consequences

- Positive: Enables live API routes, dynamic rendering, and operational health checks.
- Positive: API keys stay on the server, and data can be fetched live.
- Positive: The same image runs locally, in CI tests and in production, so what is tested is what ships.
- Negative: Increases operational complexity; requires a container compute runtime (see ADR-002).
- Negative: Higher running cost than static hosting, and the server must be secured, monitored and scaled.
- Negative: Moving off CloudFront loses HTTPS and global CDN caching.

## Possible future direction

- Prerender the pages that never change between requests (the blog index, posts and about page) with `export const prerender = true`, keeping SSR for the home page and the API routes. This reduces work per request. Prerendered pages are served before the middleware runs, so they would no longer appear in the request logs.
- Put CloudFront in front of both S3 and the container, so static pages are served from the CDN and only dynamic routes reach the server. This would also restore HTTPS without a custom domain.
