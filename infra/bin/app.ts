#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { OnboardingSchedulerStack } from '../lib/onboarding-scheduler-stack';
import { CertificateStack } from '../lib/certificate-stack';

const app = new cdk.App();

// The isolated NYCEM account. us-east-1 is required because CloudFront + ACM
// for the viewer certificate must live in us-east-1.
const env: cdk.Environment = {
  account: process.env.CDK_DEFAULT_ACCOUNT ?? '098217739895',
  region: 'us-east-1',
};

// Optional custom-domain wiring. Both are supplied via `cdk -c` context once
// the ACM certificate has been validated (see README). Without them the app is
// served on the default CloudFront domain.
const domain = app.node.tryGetContext('domain') as string | undefined;
const certArn = app.node.tryGetContext('certArn') as string | undefined;

// Optional, separate certificate stack. Deploying it will WAIT for the DNS
// validation record to be added manually (external DNS at GoDaddy/Google).
new CertificateStack(app, 'OnboardingSchedulerCertStack', {
  env,
  domainName:
    domain ?? 'OnboardingScheduler.BenjaminKrakauer.com',
  description: 'ACM certificate (us-east-1) for the Onboarding Scheduler custom domain',
});

new OnboardingSchedulerStack(app, 'OnboardingSchedulerStack', {
  env,
  domainName: domain,
  certificateArn: certArn,
  description: 'NYCEM HCM Onboarding Scheduler — backend, data, and static hosting',
});

app.synth();
