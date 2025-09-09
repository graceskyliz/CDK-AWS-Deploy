import 'dotenv/config';
import * as cdk from 'aws-cdk-lib';
import { EcsFargateStack } from '../lib/ecs-fargate-stack';

const app = new cdk.App();

const account = process.env.CDK_DEFAULT_ACCOUNT;
const region  = process.env.CDK_DEFAULT_REGION || 'us-east-1';

new EcsFargateStack(app, 'EcsFargateCrudStack', {
  env: { account, region },
  dockerImage: process.env.DOCKER_IMAGE!,
  containerPort: Number(process.env.CONTAINER_PORT ?? 8000),
  healthCheckPath: process.env.HEALTHCHECK_PATH ?? '/students',
  executionRoleArn: process.env.EXECUTION_ROLE_ARN || undefined,
  taskRoleArn: process.env.TASK_ROLE_ARN || undefined,
});
