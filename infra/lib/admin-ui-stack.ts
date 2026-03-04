import { Stack, RemovalPolicy, Duration, CfnOutput, type StackProps } from 'aws-cdk-lib'
import * as s3 from 'aws-cdk-lib/aws-s3'
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront'
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins'
import * as route53 from 'aws-cdk-lib/aws-route53'
import * as route53Targets from 'aws-cdk-lib/aws-route53-targets'
import type { ICertificate } from 'aws-cdk-lib/aws-certificatemanager'
import type { IPublicHostedZone } from 'aws-cdk-lib/aws-route53'
import type { Construct } from 'constructs'

interface AdminUiStackProps extends StackProps {
  adminDomain: string
  certificate: ICertificate
  hostedZone: IPublicHostedZone
}

export class AdminUiStack extends Stack {
  readonly bucket: s3.Bucket
  readonly distribution: cloudfront.Distribution

  constructor(scope: Construct, id: string, props: AdminUiStackProps) {
    super(scope, id, { ...props, crossRegionReferences: true })

    this.bucket = new s3.Bucket(this, 'AdminSiteBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: RemovalPolicy.RETAIN,
      enforceSSL: true,
    })

    this.distribution = new cloudfront.Distribution(this, 'AdminDistribution', {
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(this.bucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
      },
      domainNames: [props.adminDomain],
      certificate: props.certificate,
      defaultRootObject: 'index.html',
      // SPA routing: map 403/404 to index.html so the React router handles the path.
      errorResponses: [
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: Duration.seconds(0),
        },
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: Duration.seconds(0),
        },
      ],
    })

    new route53.ARecord(this, 'AdminRecord', {
      zone: props.hostedZone,
      target: route53.RecordTarget.fromAlias(
        new route53Targets.CloudFrontTarget(this.distribution),
      ),
    })

    new CfnOutput(this, 'AdminBucketName', {
      value: this.bucket.bucketName,
      description: 'S3 bucket — deploy admin UI build here then invalidate CloudFront',
    })

    new CfnOutput(this, 'AdminDistributionId', {
      value: this.distribution.distributionId,
      description: 'CloudFront distribution ID for admin',
    })

    new CfnOutput(this, 'AdminSiteUrl', {
      value: `https://${props.adminDomain}`,
    })
  }
}
