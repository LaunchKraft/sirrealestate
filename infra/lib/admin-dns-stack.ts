import { Stack, Fn, CfnOutput, type StackProps } from 'aws-cdk-lib'
import * as route53 from 'aws-cdk-lib/aws-route53'
import type { Construct } from 'constructs'

interface AdminDnsStackProps extends StackProps {
  adminDomain: string
  adminApiDomain: string
}

export class AdminDnsStack extends Stack {
  readonly adminHostedZone: route53.IPublicHostedZone
  readonly adminApiHostedZone: route53.IPublicHostedZone

  constructor(scope: Construct, id: string, props: AdminDnsStackProps) {
    super(scope, id, props)

    this.adminHostedZone = new route53.PublicHostedZone(this, 'AdminHostedZone', {
      zoneName: props.adminDomain,
    })

    this.adminApiHostedZone = new route53.PublicHostedZone(this, 'AdminApiHostedZone', {
      zoneName: props.adminApiDomain,
    })

    new CfnOutput(this, 'AdminNameServers', {
      value: Fn.join(', ', (this.adminHostedZone as route53.PublicHostedZone).hostedZoneNameServers ?? []),
      description: `MANUAL STEP: add NS delegation record for ${props.adminDomain} in parent account`,
    })

    new CfnOutput(this, 'AdminApiNameServers', {
      value: Fn.join(', ', (this.adminApiHostedZone as route53.PublicHostedZone).hostedZoneNameServers ?? []),
      description: `MANUAL STEP: add NS delegation record for ${props.adminApiDomain} in parent account`,
    })

    new CfnOutput(this, 'AdminHostedZoneId', { value: this.adminHostedZone.hostedZoneId })
    new CfnOutput(this, 'AdminApiHostedZoneId', { value: this.adminApiHostedZone.hostedZoneId })
  }
}
