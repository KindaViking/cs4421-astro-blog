# Space Blog

[![CI](https://github.com/KindaViking/cs4421-astro-blog/actions/workflows/ci.yml/badge.svg)](https://github.com/KindaViking/cs4421-astro-blog/actions/workflows/ci.yml)

A space-themed blog built with [Astro](https://astro.build): a home page, an about page and posts on rovers and space technology, with live NASA and NOAA data widgets. The project is containerised with Docker, tested with Vitest and Playwright, and shipped through a GitHub Actions pipeline and AWS CDK.

## Features

- Home page, about page and blog posts written in MDX
- Near-Earth asteroid widget using the NASA NeoWs API
- Space weather widget showing the NOAA Kp index
- `/api/health` endpoint used by the container healthcheck
- Multi-stage production Docker image and a separate dev container
- CI pipeline with lint, tests, build and Docker build checks, and a deploy job gated on them

## Tech stack

| Area | Tools |
|---|---|
| Framework | Astro with server output (`@astrojs/node`, standalone mode), MDX, sitemap |
| Testing | Vitest (unit), Playwright (end-to-end) |
| Code quality | ESLint |
| Containers | Docker (Node 22 on Alpine), Docker Compose, Amazon ECR |
| CI/CD | GitHub Actions, Dependabot |
| Infrastructure | AWS CDK, S3, CloudFront |

## Project structure

```
.
├── .github/          Workflows (CI, deploy, Playwright) and Dependabot config
├── cdk/              AWS CDK stack (S3 bucket and CloudFront distribution)
├── docs/             Project documentation
├── e2e/              Playwright end-to-end tests
├── public/           Static assets
├── src/              Pages, components, content and the API routes
│   └── pages/api/    Server endpoints, including health.ts
├── tests/            Vitest unit tests
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
| `npm test` | Run the Vitest unit tests |
| `npx playwright test` | Run the Playwright end-to-end tests |

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
| `ci.yml` | Runs `build` and `docker` jobs on every pull request and push to `main`, then a `deploy` job on `main` |
| `playwright.yml` | End-to-end tests with Playwright |
| `deploy-static.yml` | Manual-only deploy, started from the Actions tab with **Run workflow** |
| Dependabot | Automated dependency update pull requests |

How a change reaches production:

```
Pull request:   build ✓   docker ✓   deploy (skipped)
Merge to main:  build ✓   docker ✓   →   deploy
```

- **build**: `npm ci`, lint, unit tests, then `npm run build`
- **docker**: builds the production image to prove the Dockerfile still works
- **deploy**: waits for `build` and `docker`, runs only on pushes to `main`, then runs `cdk deploy`. The CDK stack uploads the site to S3 behind CloudFront and invalidates the cache (`/*`) after each upload

Workflows use least-privilege permissions (`contents: read`). AWS credentials are stored as repository secrets, never in the code.

## Publishing the image to Amazon ECR

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
- Commit messages use a type prefix: `feat`, `fix`, `chore`, `ci`, `docs` or `refactor`, followed by a short description.
- Changes go to `main` through pull requests that close their issue, once the `build` and `docker` checks pass.
- Merging to `main` triggers the deploy job.

## Releases and versioning

Versions follow [semantic versioning](https://semver.org). To cut a release:

```bash
git checkout main
git pull
npm version <major|minor|patch> -m "chore: bump version to %s"
git push origin main --follow-tags
```

Image tags match the release tag (for example `astro-blog:v1.0.0` for the `v1.0.0` release). Release notes are published on the GitHub Releases page.

## Credits

Built from the Astro blog starter template. Live data comes from the NASA NeoWs API and the NOAA Space Weather Prediction Center.
