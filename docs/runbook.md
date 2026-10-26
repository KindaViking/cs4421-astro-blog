# Runbook

What to do when something goes wrong with the live site. Work in this order: confirm the impact, stop the damage (usually by rolling back), then find the cause.

All AWS resources are in `us-east-1`.

## 1. Check the site

```bash
curl -i http://AstroA-Servi-hALX5bpxRAFJ-214040983.us-east-1.elb.amazonaws.com/api/health
```

- `200` with `"status":"ok"`: the site is up. A low `uptime` means the task was replaced recently.
- `500`: the app is running but unhealthy.
- `502` or `503`: no healthy task is behind the load balancer.

If the URL has changed, it is the `ServiceURL` output of the `AstroAppStack` stack:

```bash
aws cloudformation describe-stacks --stack-name AstroAppStack --region us-east-1 \
  --query "Stacks[0].Outputs" --output table
```

## 2. Check the alarms

CloudWatch → Alarms:

| Alarm | Fires when | Usually means |
|---|---|---|
| `astro-blog-5xx-errors` | The app logs one or more 5xx responses in a minute | A bug, a broken health check, or an upstream API failing with no cached data |
| `astro-blog-unhealthy-tasks` | A task fails the load balancer's `/api/health` check | The task has crashed, hung, or a bad deploy is starting |

## 3. Check ECS and CloudFormation

- ECS → cluster → service → **Events** and **Tasks**: are tasks starting, failing health checks, or being stopped?
- Is a deploy in progress?

```bash
aws cloudformation describe-stacks --stack-name AstroAppStack --region us-east-1 \
  --query 'Stacks[0].StackStatus' --output text
```

`UPDATE_IN_PROGRESS` means a deploy is running. `UPDATE_ROLLBACK_IN_PROGRESS` means the circuit breaker is already rolling back.

## 4. Check the logs

CloudWatch → Logs Insights → choose the `AstroAppStack` log group:

```
fields @timestamp, @message
| filter statusCode >= 500
| sort @timestamp desc
| limit 20
```

Each line is JSON with `route`, `method`, `statusCode` and `latencyMs`.

## 5. Roll back

Find the image tags. The running one is the `ImageTag` stack output; image tags are commit SHAs.

```bash
aws ecr describe-images --repository-name astro-blog --region us-east-1 \
  --query 'sort_by(imageDetails,&imagePushedAt)[-5:].[imageTags[0],imagePushedAt]' \
  --output table
```

Then use one of these:

| Method | How | Time | Notes |
|---|---|---|---|
| CDK (preferred) | `cd cdk && npx cdk deploy AstroAppStack -c imageTag=<previous sha> --require-approval never` | 5–8 min | Keeps the infrastructure code as the source of truth |
| Rerun a deploy | GitHub Actions → the last green run for the previous commit → Re-run all jobs | About 15 min | Same as CDK, through the pipeline |
| ECS console | ECS → service → Update service → previous task definition revision → Update | 2–3 min | Fastest, but CloudFormation doesn't know about it; follow up with the CDK method |
| Cancel a running deploy | `aws cloudformation cancel-update-stack --stack-name AstroAppStack --region us-east-1` | A few min | Only while the status is `UPDATE_IN_PROGRESS` |

To show a rollback causes no downtime, run this in a second terminal throughout:

```bash
while true; do curl -s -o /dev/null -w "%{http_code} " http://AstroA-Servi-hALX5bpxRAFJ-214040983.us-east-1.elb.amazonaws.com/api/health; sleep 1; done
```

A continuous run of `200`s means no downtime. The old task keeps serving until the new one passes `/api/health` (`minHealthyPercent: 100`).

## 6. Fix forward and record

1. Revert or fix the bad change on a branch, and merge it through a pull request (`main` is protected).
2. Check the deploy goes green and both alarms return to **OK**.
3. Write down what happened, how it was noticed, the cause, and what would stop it happening again.

## Common scenarios

| Scenario | What happens | What to do |
|---|---|---|
| Broken deploy | New task fails health checks; both alarms fire | Usually nothing: the circuit breaker rolls back. Then revert the commit through a PR |
| Task crashes or is stopped | Unhealthy-tasks alarm; site down briefly | ECS starts a replacement automatically. With one task, expect 1–2 minutes of downtime |
| A route returns 500s | 5xx alarm | Roll back to the last good image |
| NASA, NOAA or CelesTrak is down | Widgets hide; errors in logs | Nothing needed: the page still loads. Satellites serve cached data if any; with none, `/api/satellites` returns 502 |
| Traffic spike | Response times rise | Raise `desiredCount` in `cdk/lib/app-stack.ts` and deploy |
| CI or deploy fails | Red job in Actions | The live site is unaffected. Fix forward through a PR |
| AWS keys revoked or expired | Deploy fails at "Configure AWS Credentials" | Create new keys in IAM, update the repository secrets, rerun |


## Static site (S3 and CloudFront)

The static site is a separate deployment with no server, so there are no health checks, alarms or request logs for it.

**Check it:** open the `SiteURL` output of `StaticSiteStack`:

```bash
aws cloudformation describe-stacks --stack-name StaticSiteStack --region us-east-1 \
  --query "Stacks[0].Outputs" --output table
```

**If a bad version was deployed:** there is no image tag to roll back to, because each deploy replaces the files in the bucket. Either:

- revert the bad commit through a pull request; the merge redeploys the static site, or
- rerun the `deploy-static` workflow by hand for an earlier commit: Actions → Deploy Static Site via AWS CDK → Run workflow → choose the branch or tag

Each deploy clears the CloudFront cache (`/*`), so the change shows straight away.

**If only the static deploy fails:** the server-rendered site is unaffected, and the static site keeps serving its previous version.
