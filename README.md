# Space Blog

[![CI](https://github.com/KindaViking/cs4421-astro-blog/actions/workflows/ci.yml/badge.svg)](https://github.com/KindaViking/cs4421-astro-blog/actions/workflows/ci.yml)

A space-themed blog built with [Astro](https://astro.build): a home page, an about page and posts on rovers and space technology, with live NASA and NOAA data widgets. The project is containerised with Docker, tested at every level of a GitHub Actions pipeline, and deployed to AWS ECS Fargate with AWS CDK.

## Features

- Home page, about page and blog posts written in Markdown
- Live satellite tracker using CelesTrak orbital data, drawn on a Leaflet map
- Earth images from NASA EPIC
- Near-Earth asteroid widget using the NASA NeoWs API
- Space weather widget showing the NOAA Kp index
- `/api/health` endpoint used by the load balancer health check
- Multi-stage production Docker image and a separate dev container
- CI pipeline testing every pull request at every level, with a deploy job gated on all of it
- Zero-downtime rolling deploys with automatic rollback, and CloudWatch alarms

## Tech stack

| Area | Tools |
|---|---|
| Framework | Astro with server output (`@astrojs/node`, standalone mode), MDX, sitemap |
| Testing | Vitest, MSW, Playwright, axe-core, k6, Jest (CDK) |
| Code quality | ESLint, `astro check`, Husky commit hooks (commitlint, lint-staged) |
| Security | npm audit, CodeQL, Trivy, Dependabot |
| Containers | Docker (Node 22 on Alpine), Docker Compose, Amazon ECR |
| CI/CD | GitHub Actions, Dependabot |
| Infrastructure | AWS CDK, ECS Fargate, Application Load Balancer |
| Monitoring | CloudWatch Logs and Alarms |

## Project structure

```
.
├── .github/          Workflows (CI and deploy, CodeQL, stress test) and Dependabot config
├── .husky/           Git hooks (commit message and lint checks)
├── cdk/              AWS CDK stack (ECS Fargate service behind a load balancer)
├── docs/             Architecture decision records and the runbook
├── e2e/              Playwright end-to-end and accessibility tests
├── load/             k6 load and stress test script
├── public/           Static assets
├── src/              Pages, components, content and the API routes
│   └── pages/api/    Server endpoints, including health.ts
├── tests/            Vitest unit tests, and MSW integration tests in tests/integration
├── Dockerfile        Production image (multi-stage)
├── Dockerfile.dev    Development image used by docker-compose
└── docker-compose.yml
```

## Getting started

### Prerequisites

- Node.js 22 or later
- Docker and Docker Compose (for the container workflows)
- AWS CLI (only for publishing the image or deploying)

### Environment variables

Create a `.env` file in the project root containing the API keys the data widgets need. The file is git-ignored and excluded from the Docker build context, so keys never end up in the repository or in an image. Pass them to a container at runtime instead (see below).

### Run locally

```bash
npm ci
npm run dev
```

The site is served at <http://localhost:4321>.

### Run in a dev container

```bash
docker compose up --build
```

The project folder is mounted into the container, so edits reload in the browser. Stop it with `Ctrl+C`, or from another terminal:

```bash
docker compose down
```

If a restart fails with "Another astro dev server is already running", a stale `.astro/dev.json` file was left behind by an unclean shutdown. Delete it and start again:

```bash
rm .astro/dev.json
docker compose up
```

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the Astro dev server on port 4321 |
| `npm run build` | Build the site for production |
| `npm run lint` | Run ESLint |
| `npx astro check` | Type-check the project, including `.astro` files |
| `npm test` | Run the Vitest unit and integration tests |
| `npx playwright test` | Run the Playwright end-to-end and accessibility tests |

## Testing

Every pull request is tested at each of these levels before anything can deploy:

| Level | Tool | What it checks |
|---|---|---|
| Static analysis | ESLint, `astro check` | Code style and type errors, including in `.astro` files |
| Unit | Vitest | Utilities, components and the satellite API route |
| Infrastructure | Jest | The CDK stack: image tag, health check, rollback, no NAT gateways, alarms |
| Integration | Vitest + MSW | Real requests to CelesTrak, NASA and NOAA, intercepted at the network level |
| Container smoke | curl, jq | The production image starts, passes `/api/health`, serves pages and logs JSON |
| End-to-end | Playwright | The satellite tracker in Chromium, Firefox and WebKit, against the container |
| Accessibility | axe-core | WCAG 2.1 AA on the home page, blog index, a post and the about page |
| Load | k6 | 10 users for 30 seconds: under 1% errors and p95 under 500 ms |
| Security | npm audit, CodeQL, Trivy | Vulnerable dependencies, insecure code, and image vulnerabilities |

A heavier stress test (`load/k6.js`, `stress` profile) can be run against the live site from the Actions tab.

## Production container

The root `Dockerfile` is a multi-stage build. The builder stage installs dependencies and runs `astro build`. The runner stage copies only the build output and runs the Node server on port 4321. A `HEALTHCHECK` calls `/api/health`.

Build and run it:

```bash
docker build --platform linux/amd64 -t astro-blog:v1.0.0 .
docker run -d -p 4321:4321 --env-file .env --name my-blog astro-blog:v1.0.0
```

Check that it is healthy:

```bash
curl http://localhost:4321/api/health
docker inspect --format='{{json .State.Health}}' my-blog
```

The health status reads `starting` for the first 30 seconds, then `healthy`. Stop and remove the container with:

```bash
docker stop my-blog
docker rm my-blog
```

The healthcheck targets `127.0.0.1` rather than `localhost`. Alpine's `wget` resolves `localhost` to IPv6 while the server listens on IPv4, which would otherwise leave the container reporting unhealthy.

## CI/CD

Workflows live in `.github/workflows`:

| Workflow | Purpose |
|---|---|
| `ci.yml` | Runs `build`, `docker` and `infra` jobs on every pull request and push to `main`, then a `deploy` job on `main` |
| `codeql.yml` | CodeQL code scanning on every pull request, every push to `main` and weekly |
| `stress.yml` | Manually triggered k6 stress test against the live site |
| Dependabot | Automated dependency update pull requests |

How a change reaches production:

```
Pull request:   build ✓   docker ✓   infra ✓   deploy (skipped)
Merge to main:  build ✓   docker ✓   infra ✓   →   deploy
```

- **build**: `npm ci`, `npm audit`, lint, `astro check`, unit and integration tests, then `npm run build`
- **docker**: builds the production image, scans it with Trivy, starts it, runs the smoke test, the k6 load test and the Playwright tests against it
- **infra**: audits the CDK dependencies, type-checks the CDK app and runs its Jest tests
- **deploy**: waits for the other jobs and runs only on pushes to `main`. It builds the production image, tags it with the commit SHA, pushes it to ECR, then runs `cdk deploy -c imageTag=<sha>`. ECS starts the new task and waits for it to pass the `/api/health` check before stopping the old one. If the new task fails its health checks, the circuit breaker rolls back to the previous version

The app URL is printed as the `ServiceURL` stack output at the end of the deploy step. See [ADR-002](docs/adr/ADR-002-ecs-fargate-runtime.md) for why the app runs on ECS Fargate.

Workflows use least-privilege permissions (`contents: read`). AWS credentials are stored as repository secrets, never in the code.

## Monitoring and rollback

The app logs one JSON line per request (`route`, `method`, `statusCode`, `latencyMs`) to CloudWatch Logs. Two CloudWatch alarms watch the service: `astro-blog-5xx-errors` fires on any 5xx response in the logs, and `astro-blog-unhealthy-tasks` fires when a task fails the load balancer's health check.

Deploys are rolling updates: the old task keeps serving until the new one passes `/api/health`, and the ECS circuit breaker rolls back a deploy that never becomes healthy. This was tested with a rollback drill that deployed a broken health check.

See the [runbook](docs/runbook.md) for how to investigate an alarm and roll back by hand.

## Publishing the image to Amazon ECR

The `deploy` job pushes an image tagged with the commit SHA on every merge to `main`. To publish a tagged release by hand:

Replace `<account_id>` with your AWS account ID:

```bash
ECR_URI=<account_id>.dkr.ecr.us-east-1.amazonaws.com
aws ecr create-repository --repository-name astro-blog --region us-east-1
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin $ECR_URI
docker tag astro-blog:v1.0.0 $ECR_URI/astro-blog:v1.0.0
docker push $ECR_URI/astro-blog:v1.0.0
```

The `create-repository` command is only needed once. To verify the push:

```bash
aws ecr describe-images --repository-name astro-blog --region us-east-1
```

## Development workflow

- Work is tracked as GitHub issues, written as user stories or fix tickets with acceptance criteria.
- Each ticket gets its own branch, named `<issue-number>-<short-description>`.
- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org), e.g. `fix(a11y): raise text contrast`. A commit hook checks the format, and another runs ESLint on staged files.
- Changes go to `main` through pull requests that close their issue, once the `build` and `docker` checks pass.
- Merging to `main` triggers the deploy job.

## Releases and versioning

Versions follow [semantic versioning](https://semver.org). `main` is protected, so the version bump goes through a pull request. To cut a release:

```bash
git switch main
git pull
git switch -c bump-<version>
npm version <major|minor|patch> --no-git-tag-version
git commit -am "chore(release): bump version to <version>"
git push -u origin bump-<version>
```

Merge the pull request, then tag the merged commit on `main`:

```bash
git switch main
git pull
git tag -a v<version> -m "v<version>"
git push origin v<version>
```

Release notes are published on the GitHub Releases page. Images deployed by CI are tagged with the commit SHA.

## Credits

Built from the Astro blog starter template. Live data comes from CelesTrak, NASA EPIC, the NASA NeoWs API and the NOAA Space Weather Prediction Center.
