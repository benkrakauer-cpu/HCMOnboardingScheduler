import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as apigw from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as cr from 'aws-cdk-lib/custom-resources';
import * as logs from 'aws-cdk-lib/aws-logs';

export interface OnboardingSchedulerStackProps extends cdk.StackProps {
  /** Custom domain, e.g. OnboardingScheduler.BenjaminKrakauer.com. Optional. */
  domainName?: string;
  /** ARN of a validated ACM cert (us-east-1) for domainName. Optional. */
  certificateArn?: string;
}

export class OnboardingSchedulerStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: OnboardingSchedulerStackProps = {}) {
    super(scope, id, props);

    // ---------------------------------------------------------------------
    // Data — single-table DynamoDB, on-demand billing.
    //   PK = entity type (PERSON | TEMPLATE | ROOM | PATTERN | LOG | SETTINGS)
    //   SK = item id (SETTINGS uses the singleton id "SINGLETON")
    // ---------------------------------------------------------------------
    const table = new dynamodb.Table(this, 'DataTable', {
      partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'sk', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // ---------------------------------------------------------------------
    // Secrets — the shared password and the JWT signing key.
    //   * JWT secret is auto-generated (never shipped anywhere).
    //   * The app password secret is created with a random placeholder; the
    //     operator overwrites it with the real value ("NYCEM30") post-deploy
    //     via `aws secretsmanager put-secret-value`. The real password is
    //     therefore NEVER present in source or the CloudFormation template.
    // ---------------------------------------------------------------------
    const jwtSecret = new secretsmanager.Secret(this, 'JwtSigningSecret', {
      description: 'HS256 signing key for onboarding scheduler session tokens',
      generateSecretString: {
        passwordLength: 48,
        excludePunctuation: true,
      },
    });

    const passwordSecret = new secretsmanager.Secret(this, 'AppPasswordSecret', {
      description:
        'Shared gate password for the onboarding scheduler. Overwrite post-deploy with the real value (see README).',
      generateSecretString: {
        // Random placeholder only — operator replaces this after first deploy.
        passwordLength: 24,
        excludePunctuation: true,
      },
    });

    // ---------------------------------------------------------------------
    // Backend — a single Node.js Lambda that routes all API requests.
    // ---------------------------------------------------------------------
    const bundling = {
      minify: true,
      sourceMap: true,
      target: 'node22', // esbuild syntax target (runs on the node22/24 runtime)
      externalModules: ['@aws-sdk/*'], // provided by the Lambda runtime
    };

    const apiFn = new NodejsFunction(this, 'ApiFunction', {
      runtime: lambda.Runtime.NODEJS_24_X,
      entry: path.join(__dirname, '../../backend/src/handlers/api.ts'),
      handler: 'handler',
      memorySize: 256,
      timeout: cdk.Duration.seconds(15),
      logRetention: logs.RetentionDays.ONE_MONTH,
      bundling,
      environment: {
        TABLE_NAME: table.tableName,
        JWT_SECRET_ARN: jwtSecret.secretArn,
        PASSWORD_SECRET_ARN: passwordSecret.secretArn,
        TOKEN_TTL_SECONDS: '43200', // 12 hours
      },
    });

    table.grantReadWriteData(apiFn);
    jwtSecret.grantRead(apiFn);
    passwordSecret.grantRead(apiFn);

    // ---------------------------------------------------------------------
    // First-run seeding of the Rooms list via a deploy-time custom resource.
    // ---------------------------------------------------------------------
    const seedFn = new NodejsFunction(this, 'SeedFunction', {
      runtime: lambda.Runtime.NODEJS_24_X,
      entry: path.join(__dirname, '../../backend/src/handlers/seed.ts'),
      handler: 'handler',
      memorySize: 128,
      timeout: cdk.Duration.seconds(30),
      logRetention: logs.RetentionDays.ONE_MONTH,
      bundling,
      environment: { TABLE_NAME: table.tableName },
    });
    table.grantReadWriteData(seedFn);

    const seedProvider = new cr.Provider(this, 'SeedProvider', {
      onEventHandler: seedFn,
    });
    new cdk.CustomResource(this, 'SeedRooms', {
      serviceToken: seedProvider.serviceToken,
      properties: {
        // Bump this to force a re-seed on redeploy (idempotent regardless).
        // v2 adds the sample meeting templates.
        SeedVersion: '2',
      },
    });

    // ---------------------------------------------------------------------
    // HTTP API (API Gateway v2) with a catch-all route to the Lambda.
    // ---------------------------------------------------------------------
    const httpApi = new apigw.HttpApi(this, 'HttpApi', {
      description: 'Onboarding Scheduler API',
      corsPreflight: {
        allowOrigins: ['*'],
        allowMethods: [apigw.CorsHttpMethod.ANY],
        allowHeaders: ['Content-Type', 'Authorization'],
        maxAge: cdk.Duration.hours(1),
      },
    });

    const integration = new HttpLambdaIntegration('ApiIntegration', apiFn);
    httpApi.addRoutes({
      path: '/{proxy+}',
      methods: [apigw.HttpMethod.ANY],
      integration,
    });
    httpApi.addRoutes({
      path: '/',
      methods: [apigw.HttpMethod.ANY],
      integration,
    });

    // ---------------------------------------------------------------------
    // Frontend hosting — private S3 bucket behind CloudFront (OAC).
    // ---------------------------------------------------------------------
    const siteBucket = new s3.Bucket(this, 'SiteBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      versioned: false,
    });

    const useCustomDomain = Boolean(props.domainName && props.certificateArn);
    const certificate = useCustomDomain
      ? acm.Certificate.fromCertificateArn(this, 'ImportedCert', props.certificateArn!)
      : undefined;

    const distribution = new cloudfront.Distribution(this, 'SiteDistribution', {
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(siteBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
        compress: true,
      },
      defaultRootObject: 'index.html',
      // SPA fallback — client-side routing serves index.html for unknown paths.
      errorResponses: [
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.minutes(0),
        },
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.minutes(0),
        },
      ],
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
      ...(useCustomDomain
        ? { domainNames: [props.domainName!], certificate }
        : {}),
    });

    // ---------------------------------------------------------------------
    // Outputs
    // ---------------------------------------------------------------------
    new cdk.CfnOutput(this, 'ApiUrl', {
      value: httpApi.apiEndpoint,
      description: 'Base URL of the backend API (used as VITE_API_URL for the frontend build)',
    });
    new cdk.CfnOutput(this, 'SiteBucketName', {
      value: siteBucket.bucketName,
      description: 'S3 bucket the built frontend is synced into',
    });
    new cdk.CfnOutput(this, 'DistributionId', {
      value: distribution.distributionId,
      description: 'CloudFront distribution id (used for cache invalidation)',
    });
    new cdk.CfnOutput(this, 'DistributionDomainName', {
      value: distribution.distributionDomainName,
      description:
        'CloudFront domain. Point OnboardingScheduler.BenjaminKrakauer.com here with a CNAME.',
    });
    new cdk.CfnOutput(this, 'AppPasswordSecretName', {
      value: passwordSecret.secretName,
      description: 'Set the real password here (see README) — aws secretsmanager put-secret-value',
    });
    new cdk.CfnOutput(this, 'DataTableName', {
      value: table.tableName,
    });
    if (useCustomDomain) {
      new cdk.CfnOutput(this, 'CustomDomainUrl', {
        value: `https://${props.domainName}`,
      });
    }
  }
}
