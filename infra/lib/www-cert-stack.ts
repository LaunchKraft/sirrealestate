import { Stack, CfnOutput, type StackProps } from 'aws-cdk-lib'
import * as acm from 'aws-cdk-lib/aws-certificatemanager'
import type { Construct } from 'constructs'

interface WwwCertStackProps extends StackProps {
  baseDomain: string
}

export class WwwCertStack extends Stack {
  readonly certificate: acm.ICertificate

  constructor(scope: Construct, id: string, props: WwwCertStackProps) {
    // Must deploy to us-east-1 — required by CloudFront.
    super(scope, id, { ...props, crossRegionReferences: true })

    // DNS validation is manual: the parent account owns the sirrealtor.com zone.
    // During the first deploy, CDK will pause here waiting for the cert to be issued.
    // Go to ACM in the AWS console, find the pending certificate, and copy the
    // CNAME validation record into the sirrealtor.com zone in the parent account.
    // Once the record propagates the cert will be issued and the deploy will continue.
    this.certificate = new acm.Certificate(this, 'Certificate', {
      domainName: props.baseDomain,
      subjectAlternativeNames: [`www.${props.baseDomain}`],
      validation: acm.CertificateValidation.fromDns(),
    })

    new CfnOutput(this, 'CertificateArn', {
      value: this.certificate.certificateArn,
      description: 'ACM certificate ARN for www CloudFront (us-east-1)',
    })

    new CfnOutput(this, 'ManualStep', {
      value: `Add the CNAME validation record from the ACM console to the ${props.baseDomain} zone in the parent account`,
      description: 'MANUAL STEP — required before certificate can be issued',
    })
  }
}
