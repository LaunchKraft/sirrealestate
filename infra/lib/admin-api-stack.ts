import { Stack, CfnOutput, type StackProps } from 'aws-cdk-lib'
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2'
import * as route53 from 'aws-cdk-lib/aws-route53'
import * as route53Targets from 'aws-cdk-lib/aws-route53-targets'
import type { ICertificate } from 'aws-cdk-lib/aws-certificatemanager'
import type { IPublicHostedZone } from 'aws-cdk-lib/aws-route53'
import type { Construct } from 'constructs'

interface AdminApiStackProps extends StackProps {
  adminDomain: string
  adminApiDomain: string
  certificate: ICertificate
  hostedZone: IPublicHostedZone
}

export class AdminApiStack extends Stack {
  readonly httpApi: apigwv2.HttpApi

  constructor(scope: Construct, id: string, props: AdminApiStackProps) {
    super(scope, id, { ...props, crossRegionReferences: true })

    const customDomain = new apigwv2.DomainName(this, 'AdminApiDomain', {
      domainName: props.adminApiDomain,
      certificate: props.certificate,
    })

    this.httpApi = new apigwv2.HttpApi(this, 'AdminHttpApi', {
      apiName: 'sirrealtor-admin-api',
      defaultDomainMapping: { domainName: customDomain },
      corsPreflight: {
        allowOrigins: [
          `https://${props.adminDomain}`,
          'http://localhost:5174',
        ],
        allowMethods: [apigwv2.CorsHttpMethod.ANY],
        allowHeaders: ['Content-Type', 'Authorization'],
      },
    })

    new route53.ARecord(this, 'AdminApiRecord', {
      zone: props.hostedZone,
      target: route53.RecordTarget.fromAlias(
        new route53Targets.ApiGatewayv2DomainProperties(
          customDomain.regionalDomainName,
          customDomain.regionalHostedZoneId,
        ),
      ),
    })

    new CfnOutput(this, 'AdminApiEndpoint', {
      value: `https://${props.adminApiDomain}`,
      description: 'VITE_API_URL (admin)',
    })
  }
}
