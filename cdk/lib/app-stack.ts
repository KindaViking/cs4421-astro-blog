import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecsPatterns from 'aws-cdk-lib/aws-ecs-patterns';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';

export interface AppStackProps extends cdk.StackProps {
  repositoryName: string;
  imageTag: string;
}

export class AppStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: AppStackProps) {
    super(scope, id, props);

    // Public subnets only, no NAT gateways: tasks get a public IP so they can
    // pull from ECR directly, which avoids the hourly NAT gateway cost.
    const vpc = new ec2.Vpc(this, 'Vpc', {
      maxAzs: 2,
      natGateways: 0,
      subnetConfiguration: [
        { name: 'public', subnetType: ec2.SubnetType.PUBLIC },
      ],
    });

    const cluster = new ecs.Cluster(this, 'Cluster', { vpc });

    const repository = ecr.Repository.fromRepositoryName(
      this,
      'Repository',
      props.repositoryName,
    );

    const service = new ecsPatterns.ApplicationLoadBalancedFargateService(this, 'Service', {
      cluster,
      cpu: 256,
      memoryLimitMiB: 512,
      desiredCount: 1,
      // Keep the old task serving until the new one passes health checks.
      minHealthyPercent: 100,
      assignPublicIp: true,
      taskSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      publicLoadBalancer: true,
      circuitBreaker: { rollback: true },
      taskImageOptions: {
        image: ecs.ContainerImage.fromEcrRepository(repository, props.imageTag),
        containerPort: 4321,
        environment: {
          NODE_ENV: 'production',
          HOST: '0.0.0.0',
          PORT: '4321',
        },
        logDriver: ecs.LogDrivers.awsLogs({
          streamPrefix: 'astro',
          logRetention: logs.RetentionDays.ONE_WEEK,
        }),
      },
    });

    service.targetGroup.configureHealthCheck({
      path: '/api/health',
      healthyHttpCodes: '200',
      interval: cdk.Duration.seconds(30),
    });

    // Faster deploys: stop routing to old tasks after 30s instead of 5 minutes.
    service.targetGroup.setAttribute('deregistration_delay.timeout_seconds', '30');

    new cdk.CfnOutput(this, 'ImageTag', { value: props.imageTag });
  }
}
