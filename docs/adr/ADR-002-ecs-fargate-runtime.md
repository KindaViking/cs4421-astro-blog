# ADR-002: Run the Container on Amazon ECS Fargate

## Status

Accepted (2026-10-17)

## Context

ADR-001 moved the app to a server-rendered Node runtime packaged as a Docker image, and the image is published to Amazon ECR. The CI deploy job still uploaded `dist/` to S3 behind CloudFront, which cannot run the Node server, so API routes such as `/api/health` did not work in production.

The runtime needs to:

- run the existing Docker image without changes
- check the app's health and only send traffic to healthy instances
- deploy new versions without downtime, and roll back a bad one
- be defined in code and tested in CI
- stay cheap enough for a student account

### Options considered

| Option | Why it was or wasn't chosen |
|---|---|
| AWS App Runner | The simplest option, but it stopped accepting new customers on 30 April 2026 and this account has no subscription to it |
| **ECS on Fargate** | **Chosen.** Runs the image as is, with no servers to manage; built-in rolling deploys, health checks and rollback |
| ECS on EC2 | Same deploy model, but the EC2 instances must be patched and scaled by hand |
| A single EC2 instance running Docker | Cheapest compute, but no health-checked rolling deploys, and the server must be maintained by hand |
| AWS Lambda | No always-on cost, but the app would need a different adapter and request model, and cold starts add latency |
| Amazon EKS (Kubernetes) | The cluster control plane alone costs about $73 a month, and Kubernetes is far more than one small service needs |

## Decision

Deploy the ECR image to Amazon ECS on Fargate behind an Application Load Balancer, defined in AWS CDK (`cdk/lib/app-stack.ts`).

- CI tags each image with the commit SHA, pushes it to ECR and deploys that exact tag, so every deploy can be traced to a commit.
- The load balancer health check calls `/api/health`.
- The deployment circuit breaker rolls back to the previous task definition if new tasks fail their health checks.
- Tasks run in public subnets with public IPs and there are no NAT gateways, which keeps the cost down for a student account.

Key settings:

| Setting | Value | Why |
|---|---|---|
| Task size | 0.25 vCPU, 512 MB | The smallest Fargate size; enough for one small Node server |
| Desired count | 1 task | Keeps cost down; see Consequences for the trade-off |
| `minHealthyPercent` | 100 | The old task keeps serving until the new one is healthy, so deploys have no downtime |
| Health check | `/api/health` every 30 s, expecting 200 | Only healthy tasks receive traffic |
| Circuit breaker | Rollback on | A deploy that never becomes healthy returns to the last working version automatically |
| Deregistration delay | 30 s (default 300 s) | Old tasks stop receiving traffic sooner, so deploys finish faster |
| Logs | CloudWatch Logs, kept 1 week | Request logs for debugging and alarms, without paying to store them long term |

## Consequences

- Positive: server routes work in production, deployments are reproducible and roll back automatically, and the infrastructure is tested in CI.
- Positive: rolling deploys give zero downtime without paying for a second environment, as blue/green would.
- Negative: an always-on load balancer and Fargate task cost more than S3 and CloudFront, and the site is served over plain HTTP until a domain and certificate are added.
- Negative: with a single task, a crash means a short outage (about 1–2 minutes) while ECS starts a replacement. Two tasks would remove that, at roughly double the compute cost.
- Negative: public subnets are less isolated than private ones. The security group still only accepts traffic from the load balancer.
- Negative: CI authenticates to AWS with long-lived access keys stored as repository secrets.
- The old `StaticSiteStack` must be deleted by hand, since it is no longer defined in the CDK app.

## Updates

- **2026-10-21:** Added two CloudWatch alarms to the stack: one on 5xx responses in the request logs, one on unhealthy load balancer targets. A rollback drill deployed a deliberately broken health check: both alarms fired, the circuit breaker rolled the deploy back, and the original task kept serving throughout.
- **2026-10-24:** A stress test against the live site served 50 concurrent users with a p95 of 9 ms. A local breakpoint test with the same CPU and memory limits stayed under a p95 of 500 ms up to about 200–260 requests a second, then slowed as requests queued; no requests failed.

