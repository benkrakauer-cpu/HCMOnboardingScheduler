import * as cdk from 'aws-cdk-lib';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import { Construct } from 'constructs';

export interface CertificateStackProps extends cdk.StackProps {
  domainName: string;
}

/**
 * Standalone ACM certificate for the custom domain.
 *
 * DNS for this domain is managed EXTERNALLY (GoDaddy registrar / Google DNS),
 * so validation is DNS-based with no Route 53 hosted zone. Deploying this stack
 * will sit in CREATE_IN_PROGRESS until the CNAME validation record is added at
 * the DNS provider. The validation record can be read at any time (even while
 * the deploy is waiting) with:
 *
 *   aws acm describe-certificate --region us-east-1 \
 *     --certificate-arn <arn> \
 *     --query 'Certificate.DomainValidationOptions[].ResourceRecord'
 *
 * Once the record propagates and ACM issues the certificate, this stack
 * finishes and exports the certificate ARN for use by the main stack via
 * `-c certArn=...`.
 */
export class CertificateStack extends cdk.Stack {
  public readonly certificateArn: string;

  constructor(scope: Construct, id: string, props: CertificateStackProps) {
    super(scope, id, props);

    const certificate = new acm.Certificate(this, 'SiteCertificate', {
      domainName: props.domainName,
      validation: acm.CertificateValidation.fromDns(),
    });

    this.certificateArn = certificate.certificateArn;

    new cdk.CfnOutput(this, 'CertificateArn', {
      value: certificate.certificateArn,
      description: 'Pass this to the main stack: make deploy-backend CERT_ARN=<this>',
    });

    new cdk.CfnOutput(this, 'CertificateDomain', {
      value: props.domainName,
    });
  }
}
