import { Stack, RemovalPolicy, CfnOutput, type StackProps } from 'aws-cdk-lib'
import * as cognito from 'aws-cdk-lib/aws-cognito'
import * as lambda from 'aws-cdk-lib/aws-lambda'
import type { Construct } from 'constructs'

interface AdminAuthStackProps extends StackProps {
  adminDomain: string
}

export class AdminAuthStack extends Stack {
  readonly userPool: cognito.UserPool
  readonly userPoolClient: cognito.UserPoolClient

  constructor(scope: Construct, id: string, props: AdminAuthStackProps) {
    super(scope, id, props)

    // Inline Lambda — restricts self-signup to @sirrealtor.com addresses only.
    const preSignUpLambda = new lambda.Function(this, 'AdminPreSignUpLambda', {
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline(`
        exports.handler = async (event) => {
          const email = (event.request.userAttributes.email || '').toLowerCase();
          if (!email.endsWith('@sirrealtor.com')) {
            throw new Error('Sign up is restricted to @sirrealtor.com email addresses.');
          }
          return event;
        };
      `),
    })

    this.userPool = new cognito.UserPool(this, 'AdminUserPool', {
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      autoVerify: { email: true },
      signInCaseSensitive: false,
      lambdaTriggers: {
        preSignUp: preSignUpLambda,
      },
      removalPolicy: RemovalPolicy.RETAIN,
    })

    this.userPoolClient = new cognito.UserPoolClient(this, 'AdminUserPoolClient', {
      userPool: this.userPool,
      generateSecret: false,
      authFlows: {
        userSrp: true,
      },
      oAuth: {
        callbackUrls: [
          `https://${props.adminDomain}`,
          'http://localhost:5174',
        ],
        logoutUrls: [
          `https://${props.adminDomain}`,
          'http://localhost:5174',
        ],
      },
    })

    new CfnOutput(this, 'AdminUserPoolId', {
      value: this.userPool.userPoolId,
      description: 'VITE_COGNITO_USER_POOL_ID (admin)',
    })

    new CfnOutput(this, 'AdminUserPoolClientId', {
      value: this.userPoolClient.userPoolClientId,
      description: 'VITE_COGNITO_USER_POOL_CLIENT_ID (admin)',
    })

    new CfnOutput(this, 'AdminRegion', {
      value: this.region,
      description: 'AWS region (admin)',
    })
  }
}
