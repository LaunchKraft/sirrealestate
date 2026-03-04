import { Stack, CfnOutput, type StackProps } from 'aws-cdk-lib'
import * as acm from 'aws-cdk-lib/aws-certificatemanager'
import type { IPublicHostedZone } from 'aws-cdk-lib/aws-route53'
import type { Construct } from 'constructs'

interface AdminCertStackProps extends StackProps {
  adminDomain: string
  adminApiDomain: string
  adminHostedZone: IPublicHostedZone
  adminApiHostedZone: IPublicHostedZone
}

export class AdminCertStack extends Stack {
  readonly adminCertificate: acm.ICertificate
  readonly adminApiCertificate: acm.ICertificate

  constructor(scope: Construct, id: string, props: AdminCertStackProps) {
    super(scope, id, { ...props, crossRegionReferences: true })

    // CloudFront requires ACM certs in us-east-1.
    this.adminCertificate = new acm.Certificate(this, 'AdminCertificate', {
      domainName: props.adminDomain,
      validation: acm.CertificateValidation.fromDns(props.adminHostedZone),
    })

    // API Gateway HTTP API uses a regional cert.
    this.adminApiCertificate = new acm.Certificate(this, 'AdminApiCertificate', {
      domainName: props.adminApiDomain,
      validation: acm.CertificateValidation.fromDns(props.adminApiHostedZone),
    })

    new CfnOutput(this, 'AdminCertificateArn', {
      value: this.adminCertificate.certificateArn,
      description: 'ACM certificate ARN for admin CloudFront (us-east-1)',
    })

    new CfnOutput(this, 'AdminApiCertificateArn', {
      value: this.adminApiCertificate.certificateArn,
      description: 'ACM certificate ARN for admin API Gateway custom domain',
    })
  }
}
