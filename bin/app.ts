import 'dotenv/config';
import * as cdk from 'aws-cdk-lib';
import { EcsFargateStack } from '../lib/ecs-fargate-stack';

const app = new cdk.App();

const account = process.env.CDK_DEFAULT_ACCOUNT;
const region  = process.env.CDK_DEFAULT_REGION || 'us-east-1';

const imageUri      = app.node.tryGetContext('imageUri')      ?? process.env.DOCKER_IMAGE;
const containerPort = Number(app.node.tryGetContext('containerPort') ?? process.env.CONTAINER_PORT ?? 8000);
const healthPath    = app.node.tryGetContext('healthPath')    ?? process.env.HEALTHCHECK_PATH ?? '/students';
const labRoleArn    = app.node.tryGetContext('labRoleArn')    ?? process.env.EXECUTION_ROLE_ARN; // usaremos el mismo para task/execution
const desiredCount  = Number(app.node.tryGetContext('desiredCount') ?? 1);

new EcsFargateStack(app, 'EcsFargateCrudStack', {
  env: { account, region },
  dockerImage: imageUri!,
  containerPort,
  healthCheckPath: healthPath,
  labRoleArn,            // <-- un solo ARN para ambos roles
  desiredCount,
  synthesizer: new cdk.BootstraplessSynthesizer(), // ⬅️ clave
});
