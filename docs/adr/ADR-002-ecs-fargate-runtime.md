# ADR-002: Run the Container on Amazon ECS Fargate
## Status: Accepted (Date: 2026-10-17)
## Context
ADR-001 moved the app to a server-rendered Node runtime packaged as a Docker image, and the image is published to Amazon ECR. The CI deploy job still uploaded `dist/` to S3 behind CloudFront, which cannot run the Node server, so API routes such as `/api/health` did not work in production.

AWS App Runner was the simplest option, but it stopped accepting new customers on 30 April 2026 and this account has no subscription to it.
## Decision
Deploy the ECR image to Amazon ECS on Fargate behind an Application Load Balancer, defined in AWS CDK (`cdk/lib/app-stack.ts`).

- CI tags each image with the commit SHA, pushes it to ECR and deploys that exact tag, so every deploy can be traced to a commit.
- The load balancer health check calls `/api/health`.
- The deployment circuit breaker rolls back to the previous task definition if new tasks fail their health checks.
- Tasks run in public subnets with public IPs and there are no NAT gateways, which keeps the cost down for a student account.
## Consequences
- Positive: server routes work in production, deployments are reproducible and roll back automatically, and the infrastructure is tested in CI.
- Negative: an always-on load balancer and Fargate task cost more than S3 and CloudFront, and the site is served over plain HTTP until a domain and certificate are added.
- The old `StaticSiteStack` must be deleted by hand, since it is no longer defined in the CDK app.
