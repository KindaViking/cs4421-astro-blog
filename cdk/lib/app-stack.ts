import * as cdk from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
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

    // Kept in a variable so the alarms below can use the log group it creates.
    const logDriver = new ecs.AwsLogDriver({
      streamPrefix: 'astro',
      logRetention: logs.RetentionDays.ONE_WEEK,
    });

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
        logDriver,
      },
    });

    service.targetGroup.configureHealthCheck({
      path: '/api/health',
      healthyHttpCodes: '200',
      interval: cdk.Duration.seconds(30),
    });

    // Faster deploys: stop routing to old tasks after 30s instead of 5 minutes.
    service.targetGroup.setAttribute('deregistration_delay.timeout_seconds', '30');

    const serverErrors = new logs.MetricFilter(this, 'ServerErrorsFilter', {
      logGroup: logDriver.logGroup!,
      filterPattern: logs.FilterPattern.literal('{ $.statusCode >= 500 }'),
      metricNamespace: 'AstroBlog',
      metricName: 'ServerErrors',
      metricValue: '1',
      defaultValue: 0,
    });

    new cloudwatch.Alarm(this, 'ServerErrorsAlarm', {
      alarmName: 'astro-blog-5xx-errors',
      alarmDescription: 'The app logged one or more 5xx responses in the last minute',
      metric: serverErrors.metric({
        statistic: cloudwatch.Stats.SUM,
        period: cdk.Duration.minutes(1),
      }),
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    // Alarm 2: a task is failing the load balancer's /api/health check.
    new cloudwatch.Alarm(this, 'UnhealthyTasksAlarm', {
      alarmName: 'astro-blog-unhealthy-tasks',
      alarmDescription: 'A task is failing the /api/health check',
      metric: service.targetGroup.metrics.unhealthyHostCount({
        statistic: cloudwatch.Stats.MAXIMUM,
        period: cdk.Duration.minutes(1),
      }),
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    new cdk.CfnOutput(this, 'ImageTag', { value: props.imageTag });
  }
}
