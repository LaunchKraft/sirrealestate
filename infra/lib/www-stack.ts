import { Stack, RemovalPolicy, Duration, CfnOutput, type StackProps } from 'aws-cdk-lib'
import * as s3 from 'aws-cdk-lib/aws-s3'
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront'
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins'
import type { ICertificate } from 'aws-cdk-lib/aws-certificatemanager'
import type { Construct } from 'constructs'

interface WwwStackProps extends StackProps {
  baseDomain: string
  certificate: ICertificate
}

export class WwwStack extends Stack {
  readonly bucket: s3.Bucket
  readonly distribution: cloudfront.Distribution

  constructor(scope: Construct, id: string, props: WwwStackProps) {
    super(scope, id, { ...props, crossRegionReferences: true })

    this.bucket = new s3.Bucket(this, 'SiteBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: RemovalPolicy.RETAIN,
      enforceSSL: true,
    })

    // Both sirrealtor.com and www.sirrealtor.com are served by this distribution.
    this.distribution = new cloudfront.Distribution(this, 'Distribution', {
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(this.bucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
      },
      domainNames: [props.baseDomain, `www.${props.baseDomain}`],
      certificate: props.certificate,
      defaultRootObject: 'index.html',
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

    new CfnOutput(this, 'BucketName', {
      value: this.bucket.bucketName,
      description: 'S3 bucket — deploy www build here then invalidate CloudFront',
    })

    new CfnOutput(this, 'DistributionId', {
      value: this.distribution.distributionId,
      description: 'CloudFront distribution ID',
    })

    new CfnOutput(this, 'CloudFrontDomain', {
      value: this.distribution.distributionDomainName,
      description: 'MANUAL DNS STEP: create A/ALIAS records in the parent account zone pointing here',
    })

    new CfnOutput(this, 'SiteUrl', {
      value: `https://${props.baseDomain}`,
    })
  }
}
