import * as path from 'path'
import { Duration, Stack, type StackProps } from 'aws-cdk-lib'
import * as lambda from 'aws-cdk-lib/aws-lambda'
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs'
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2'
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations'
import { HttpJwtAuthorizer } from 'aws-cdk-lib/aws-apigatewayv2-authorizers'
import * as cognito from 'aws-cdk-lib/aws-cognito'
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb'
import * as iam from 'aws-cdk-lib/aws-iam'
import type { Construct } from 'constructs'

interface AdminServiceStackProps extends StackProps {
  httpApi: apigwv2.HttpApi
  adminUserPool: cognito.UserPool
  adminUserPoolClient: cognito.UserPoolClient
  /** Consumer Cognito user pool ID — for listing and managing buyer accounts */
  consumerUserPoolId: string
  userProfileTable: dynamodb.Table
  searchResultsTable: dynamodb.Table
  viewingsTable: dynamodb.Table
  documentsTable: dynamodb.Table
  offersTable: dynamodb.Table
  waitlistTable: dynamodb.Table
}

export class AdminServiceStack extends Stack {
  constructor(scope: Construct, id: string, props: AdminServiceStackProps) {
    super(scope, id, props)

    const adminLambda = new NodejsFunction(this, 'AdminLambda', {
      entry: path.join(__dirname, '../../admin-service/src/handler.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      timeout: Duration.seconds(30),
      environment: {
        CONSUMER_USER_POOL_ID: props.consumerUserPoolId,
        USER_PROFILE_TABLE: props.userProfileTable.tableName,
        SEARCH_RESULTS_TABLE: props.searchResultsTable.tableName,
        VIEWINGS_TABLE: props.viewingsTable.tableName,
        DOCUMENTS_TABLE: props.documentsTable.tableName,
        OFFERS_TABLE: props.offersTable.tableName,
        WAITLIST_TABLE: props.waitlistTable.tableName,
      },
      bundling: { externalModules: [] as string[] },
    })

    // Read-write access to user profile table (admin can update profiles and delete search profiles)
    props.userProfileTable.grantReadWriteData(adminLambda)
    props.searchResultsTable.grantReadData(adminLambda)
    props.viewingsTable.grantReadData(adminLambda)
    props.documentsTable.grantReadData(adminLambda)
    props.offersTable.grantReadData(adminLambda)
    props.waitlistTable.grantReadWriteData(adminLambda)

    // SES permission for sending beta invite emails
    adminLambda.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['ses:SendEmail'],
        resources: [`arn:aws:ses:${this.region}:${this.account}:identity/sirrealtor.com`],
      }),
    )

    // Permission to list and manage users in the consumer Cognito pool
    adminLambda.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          'cognito-idp:ListUsers',
          'cognito-idp:AdminGetUser',
          'cognito-idp:AdminDisableUser',
          'cognito-idp:AdminEnableUser',
          'cognito-idp:AdminDeleteUser',
        ],
        resources: [
          `arn:aws:cognito-idp:${this.region}:${this.account}:userpool/${props.consumerUserPoolId}`,
        ],
      }),
    )

    const adminAuthorizer = new HttpJwtAuthorizer(
      'AdminCognitoAuthorizer',
      `https://cognito-idp.${this.region}.amazonaws.com/${props.adminUserPool.userPoolId}`,
      {
        jwtAudience: [props.adminUserPoolClient.userPoolClientId],
      },
    )

    const adminIntegration = new HttpLambdaIntegration('AdminIntegration', adminLambda)

    const routes: { id: string; routePath: string; method: apigwv2.HttpMethod }[] = [
      { id: 'DashboardRoute', routePath: '/dashboard', method: apigwv2.HttpMethod.GET },
      { id: 'UsersRoute', routePath: '/users', method: apigwv2.HttpMethod.GET },
      { id: 'UsersPatchRoute', routePath: '/users', method: apigwv2.HttpMethod.PATCH },
      { id: 'ProfilePatchRoute', routePath: '/profile', method: apigwv2.HttpMethod.PATCH },
      { id: 'SearchesDeleteRoute', routePath: '/searches', method: apigwv2.HttpMethod.DELETE },
      { id: 'DocumentsRoute', routePath: '/documents', method: apigwv2.HttpMethod.GET },
      { id: 'ViewingsRoute', routePath: '/viewings', method: apigwv2.HttpMethod.GET },
      { id: 'OffersRoute', routePath: '/offers', method: apigwv2.HttpMethod.GET },
      { id: 'WaitlistListRoute', routePath: '/waitlist', method: apigwv2.HttpMethod.GET },
      { id: 'WaitlistDeleteRoute', routePath: '/waitlist', method: apigwv2.HttpMethod.DELETE },
      { id: 'WaitlistPatchRoute', routePath: '/waitlist', method: apigwv2.HttpMethod.PATCH },
      { id: 'WaitlistInviteRoute', routePath: '/waitlist/invite', method: apigwv2.HttpMethod.POST },
    ]

    for (const route of routes) {
      new apigwv2.HttpRoute(this, route.id, {
        httpApi: props.httpApi,
        routeKey: apigwv2.HttpRouteKey.with(route.routePath, route.method),
        integration: adminIntegration,
        authorizer: adminAuthorizer,
      })
    }
  }
}
