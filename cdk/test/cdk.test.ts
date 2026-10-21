import * as cdk from 'aws-cdk-lib/core';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { AppStack } from '../lib/app-stack';

function synth(imageTag = 'abc123') {
  const app = new cdk.App();
  const stack = new AppStack(app, 'TestStack', {
    env: { account: '123456789012', region: 'us-east-1' },
    repositoryName: 'astro-blog',
    imageTag,
  });
  return Template.fromStack(stack);
}

test('runs the requested image tag from ECR on port 4321', () => {
  const taskDefs = synth('abc123').findResources('AWS::ECS::TaskDefinition');
  const [container] = Object.values(taskDefs)[0].Properties.ContainerDefinitions;

  expect(JSON.stringify(container.Image)).toContain('/astro-blog:abc123');
  expect(container.PortMappings).toEqual([
    expect.objectContaining({ ContainerPort: 4321 }),
  ]);
});

test('load balancer health check uses /api/health', () => {
  synth().hasResourceProperties('AWS::ElasticLoadBalancingV2::TargetGroup', {
    HealthCheckPath: '/api/health',
    Port: 80,
  });
});

test('failed deployments roll back automatically', () => {
  synth().hasResourceProperties('AWS::ECS::Service', {
    LaunchType: 'FARGATE',
    DeploymentConfiguration: Match.objectLike({
      DeploymentCircuitBreaker: { Enable: true, Rollback: true },
    }),
  });
});

test('creates no NAT gateways', () => {
  synth().resourceCountIs('AWS::EC2::NatGateway', 0);
});

test('alarms on 5xx log lines and unhealthy tasks', () => {
  const template = synth();
  template.hasResourceProperties('AWS::Logs::MetricFilter', {
    FilterPattern: '{ $.statusCode >= 500 }',
  });
  template.hasResourceProperties('AWS::CloudWatch::Alarm', {
    AlarmName: 'astro-blog-5xx-errors',
  });
  template.hasResourceProperties('AWS::CloudWatch::Alarm', {
    AlarmName: 'astro-blog-unhealthy-tasks',
    MetricName: 'UnHealthyHostCount',
  });
});
