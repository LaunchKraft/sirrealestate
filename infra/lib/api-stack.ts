import { Stack, CfnOutput, type StackProps } from 'aws-cdk-lib'
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2'
import * as route53 from 'aws-cdk-lib/aws-route53'
import * as route53Targets from 'aws-cdk-lib/aws-route53-targets'
import type { ICertificate } from 'aws-cdk-lib/aws-certificatemanager'
import type { IPublicHostedZone } from 'aws-cdk-lib/aws-route53'
import type { Construct } from 'constructs'

interface ApiStackProps extends StackProps {
  appDomain: string
  apiDomain: string
  certificate: ICertificate
  hostedZone: IPublicHostedZone
}

export class ApiStack extends Stack {
  readonly httpApi: apigwv2.HttpApi

  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, { ...props, crossRegionReferences: true })

    const customDomain = new apigwv2.DomainName(this, 'ApiDomain', {
      domainName: props.apiDomain,
      certificate: props.certificate,
    })

    // HTTP API v2 — cheaper and simpler than REST API.
    // Routes are added in service stacks (e.g. ChatServiceStack).
    this.httpApi = new apigwv2.HttpApi(this, 'HttpApi', {
      apiName: 'sirrealtor-api',
      defaultDomainMapping: { domainName: customDomain },
      corsPreflight: {
        allowOrigins: [
          `https://${props.appDomain}`,
          'http://localhost:5173',
          'https://sirrealtor.com',
          'https://www.sirrealtor.com',
        ],
        allowMethods: [apigwv2.CorsHttpMethod.ANY],
        allowHeaders: ['Content-Type', 'Authorization'],
      },
    })

    new route53.ARecord(this, 'ApiRecord', {
      zone: props.hostedZone,
      target: route53.RecordTarget.fromAlias(
        new route53Targets.ApiGatewayv2DomainProperties(
          customDomain.regionalDomainName,
          customDomain.regionalHostedZoneId,
        ),
      ),
    })

    new CfnOutput(this, 'ApiEndpoint', {
      value: `https://${props.apiDomain}`,
      description: 'VITE_API_URL',
    })
  }
}
