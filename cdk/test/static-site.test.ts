import * as path from 'path';
import * as cdk from 'aws-cdk-lib/core';
import { Template } from 'aws-cdk-lib/assertions';
import { StaticSiteStack } from '../lib/static-site-stack';

function synth() {
  const app = new cdk.App();
  const stack = new StaticSiteStack(app, 'TestStaticSite', {
    env: { account: '123456789012', region: 'us-east-1' },
    siteDir: path.join(__dirname, 'fixtures', 'site'),
  });
  return Template.fromStack(stack);
}

test('CloudFront serves index.html at the root', () => {
  synth().hasResourceProperties('AWS::CloudFront::Distribution', {
    DistributionConfig: { DefaultRootObject: 'index.html' },
  });
});

test('the bucket is only reachable through CloudFront', () => {
  synth().resourceCountIs('AWS::CloudFront::OriginAccessControl', 1);
});

test('uploads the site and invalidates the CloudFront cache', () => {
  synth().hasResourceProperties('Custom::CDKBucketDeployment', {
    DistributionPaths: ['/*'],
  });
});
