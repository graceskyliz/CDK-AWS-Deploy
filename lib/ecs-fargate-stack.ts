import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecs_patterns from 'aws-cdk-lib/aws-ecs-patterns';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as iam from 'aws-cdk-lib/aws-iam';

interface Props extends cdk.StackProps {
  dockerImage: string;
  containerPort: number;
  healthCheckPath: string;
  labRoleArn?: string;    // usamos el mismo para execution y task
  desiredCount?: number;
}

export class EcsFargateStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: Props) {
    super(scope, id, props);

    // VPC con SOLO subnets públicas (sin NAT)
    const vpc = new ec2.Vpc(this, 'VpcPublicOnly', {
      maxAzs: 2,
      natGateways: 0,
      subnetConfiguration: [
        { name: 'Public', subnetType: ec2.SubnetType.PUBLIC, cidrMask: 24 }
      ]
    });

    const cluster = new ecs.Cluster(this, 'Cluster', { vpc });

    // Reusar LabRole para ambos roles si nos lo pasan
    const executionRole = props.labRoleArn
      ? iam.Role.fromRoleArn(this, 'ExecRole', props.labRoleArn, { mutable: false })
      : undefined;

    const taskRole = props.labRoleArn
      ? iam.Role.fromRoleArn(this, 'TaskRole', props.labRoleArn, { mutable: false })
      : undefined;

    const logGroup = new logs.LogGroup(this, 'AppLogs', {
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });

    // Servicio Fargate con ALB PÚBLICO, tareas en subnets públicas con IP pública
    const svc = new ecs_patterns.ApplicationLoadBalancedFargateService(this, 'Service', {
      cluster,
      cpu: 256,
      memoryLimitMiB: 512,
      desiredCount: props.desiredCount ?? 1,
      publicLoadBalancer: true,
      listenerPort: 80,
      assignPublicIp: true,
      taskSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      taskImageOptions: {
        image: ecs.ContainerImage.fromRegistry(props.dockerImage),
        containerPort: props.containerPort,
        enableLogging: true,
        logDriver: ecs.LogDriver.awsLogs({ streamPrefix: 'app', logGroup }),
        executionRole,
        taskRole,
        // environment: { SQLITE_PATH: '/app/students.sqlite' }
      },
      healthCheckGracePeriod: cdk.Duration.seconds(60),
    });

    svc.targetGroup.configureHealthCheck({
      path: props.healthCheckPath,
      healthyHttpCodes: '200-399',
      healthyThresholdCount: 2,
      unhealthyThresholdCount: 5,
      interval: cdk.Duration.seconds(30),
      timeout: cdk.Duration.seconds(5),
    });

    svc.listener.connections.allowDefaultPortFromAnyIpv4('OpenToWorld');

    new cdk.CfnOutput(this, 'LoadBalancerDNS', {
      value: svc.loadBalancer.loadBalancerDnsName
    });
  }
}
