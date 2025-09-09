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
  executionRoleArn?: string;
  taskRoleArn?: string;
}

export class EcsFargateStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: Props) {
    super(scope, id, props);

    // VPC con salida a internet (NAT para descargar imagen de Docker Hub)
    const vpc = new ec2.Vpc(this, 'Vpc', { maxAzs: 2, natGateways: 1 });

    // Cluster ECS
    const cluster = new ecs.Cluster(this, 'Cluster', { vpc });

    // Reusar roles existentes si te los dan (útil en cuentas restringidas)
    const executionRole = props.executionRoleArn
      ? iam.Role.fromRoleArn(this, 'ExecRole', props.executionRoleArn, { mutable: false })
      : undefined;
    const taskRole = props.taskRoleArn
      ? iam.Role.fromRoleArn(this, 'TaskRole', props.taskRoleArn, { mutable: false })
      : undefined;

    // Logs
    const logGroup = new logs.LogGroup(this, 'AppLogs', {
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Servicio Fargate con ALB público
    const fargate = new ecs_patterns.ApplicationLoadBalancedFargateService(this, 'Service', {
      cluster,
      cpu: 256,
      memoryLimitMiB: 512,
      desiredCount: 1,
      publicLoadBalancer: true,
      listenerPort: 80,
      taskSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      assignPublicIp: false,
      taskImageOptions: {
        image: ecs.ContainerImage.fromRegistry(props.dockerImage),
        containerPort: props.containerPort,
        enableLogging: true,
        logDriver: ecs.LogDriver.awsLogs({ streamPrefix: 'app', logGroup }),
        // Si tu imagen requiere variables de entorno, agrégalas aquí:
        // environment: { SQLITE_PATH: '/app/students.sqlite' },
        executionRole,
        taskRole,
      },
      healthCheckGracePeriod: cdk.Duration.seconds(60),
    });

    // Health check: tu API tiene GET /students
    fargate.targetGroup.configureHealthCheck({
      path: props.healthCheckPath,
      healthyHttpCodes: '200-399',
      healthyThresholdCount: 2,
      unhealthyThresholdCount: 5,
      interval: cdk.Duration.seconds(30),
      timeout: cdk.Duration.seconds(5),
    });

    // Abrir puerto 80 del ALB
    fargate.listener.connections.allowDefaultPortFromAnyIpv4('OpenToWorld');

    // Output
    new cdk.CfnOutput(this, 'LoadBalancerDNS', {
      value: fargate.loadBalancer.loadBalancerDnsName,
    });
  }
}
