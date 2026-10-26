#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib/core';
import { AppStack } from '../lib/app-stack';
import { StaticSiteStack } from '../lib/static-site-stack';

const app = new cdk.App();

// CI passes the commit SHA it just pushed to ECR: cdk deploy -c imageTag=<sha>
const imageTag = app.node.tryGetContext('imageTag') ?? 'v1.0.0';

new AppStack(app, 'AstroAppStack', {
  env: { account: '986918902715', region: 'us-east-1' },
  repositoryName: 'astro-blog',
  imageTag,
});

// The static site is only defined when deploying it (cdk deploy -c staticSite=true),
// because it uploads the static build in ../dist, which must exist first.
if (app.node.tryGetContext('staticSite')) {
  new StaticSiteStack(app, 'StaticSiteStack', {
    env: { account: '986918902715', region: 'us-east-1' },
  });
}
