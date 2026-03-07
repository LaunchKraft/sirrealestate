// ci trigger 2
import * as path from 'path'
import { Duration, Stack, CfnOutput, type StackProps } from 'aws-cdk-lib'
import * as lambda from 'aws-cdk-lib/aws-lambda'
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs'
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2'
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations'
import { HttpJwtAuthorizer } from 'aws-cdk-lib/aws-apigatewayv2-authorizers'
import * as cognito from 'aws-cdk-lib/aws-cognito'
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb'
import * as s3 from 'aws-cdk-lib/aws-s3'
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager'
import * as iam from 'aws-cdk-lib/aws-iam'
import type { Construct } from 'constructs'

const ANTHROPIC_MODEL_ID = 'claude-sonnet-4-6'

interface ChatServiceStackProps extends StackProps {
  httpApi: apigwv2.HttpApi
  userPool: cognito.UserPool
  userPoolClient: cognito.UserPoolClient
  domainName: string
  userProfileTable: dynamodb.Table
  searchResultsTable: dynamodb.Table
  notificationsTable: dynamodb.Table
  viewingsTable: dynamodb.Table
  searchWorkerLambda: lambda.IFunction
  documentBucket: s3.Bucket
  documentsTable: dynamodb.Table
  offersTable: dynamodb.Table
}

export class ChatServiceStack extends Stack {
  constructor(scope: Construct, id: string, props: ChatServiceStackProps) {
    super(scope, id, props)

    const tableEnv = {
      USER_PROFILE_TABLE: props.userProfileTable.tableName,
      SEARCH_RESULTS_TABLE: props.searchResultsTable.tableName,
      NOTIFICATIONS_TABLE: props.notificationsTable.tableName,
      VIEWINGS_TABLE: props.viewingsTable.tableName,
      DOCUMENTS_TABLE: props.documentsTable.tableName,
      DOCUMENT_BUCKET_NAME: props.documentBucket.bucketName,
      OFFERS_TABLE: props.offersTable.tableName,
    }

    const bundlingOptions = { externalModules: [] as string[] }

    // Reference the manually-created Anthropic API key secret (create this in Secrets Manager first)
    const anthropicApiKeySecret = secretsmanager.Secret.fromSecretNameV2(
      this, 'AnthropicApiKey', 'SirRealtor/AnthropicApiKey',
    )

    // Reference the manually-created Dropbox Sign API key secret (create this in Secrets Manager first)
    const dropboxSignApiKeySecret = secretsmanager.Secret.fromSecretNameV2(
      this, 'DropboxSignApiKey', 'SirRealtor/DropboxSignApiKey',
    )

    // Reference the manually-created Earnnest API key secret (create when Earnnest access is granted)
    const earnnestApiKeySecret = secretsmanager.Secret.fromSecretNameV2(
      this, 'EarnnestApiKey', 'SirRealtor/EarnnestApiKey',
    )

    // Chat Lambda
    const chatLambda = new NodejsFunction(this, 'ChatLambda', {
      entry: path.join(__dirname, '../../chat-service/src/handler.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      timeout: Duration.seconds(60),
      environment: {
        ANTHROPIC_MODEL_ID,
        ANTHROPIC_API_KEY_SECRET_ARN: anthropicApiKeySecret.secretArn,
        DROPBOX_SIGN_API_KEY_SECRET_ARN: dropboxSignApiKeySecret.secretArn,
        EARNNEST_API_KEY_SECRET_ARN: earnnestApiKeySecret.secretArn,
        AGENT_EMAIL_BCC: 'noreply@sirrealtor.com',
        SEARCH_WORKER_FUNCTION_NAME: props.searchWorkerLambda.functionName,
        ...tableEnv,
      },
      bundling: bundlingOptions,
    })

    // Anthropic + Dropbox Sign API key read permissions
    anthropicApiKeySecret.grantRead(chatLambda)
    dropboxSignApiKeySecret.grantRead(chatLambda)

    // DynamoDB permissions for chat lambda
    props.userProfileTable.grantReadWriteData(chatLambda)
    props.searchResultsTable.grantReadData(chatLambda)
    props.notificationsTable.grantWriteData(chatLambda)
    props.viewingsTable.grantReadWriteData(chatLambda)

    // Permission to invoke the search worker Lambda
    props.searchWorkerLambda.grantInvoke(chatLambda)

    // Grant chat Lambda read/write access to document bucket and documents table
    // (generate_purchase_agreement writes the PDF to S3 and creates a Documents record)
    props.documentBucket.grantReadWrite(chatLambda)
    props.documentsTable.grantReadWriteData(chatLambda)
    props.offersTable.grantReadWriteData(chatLambda)

    // SES permission for schedule_viewing tool
    chatLambda.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['ses:SendEmail'],
        resources: [
          `arn:aws:ses:${this.region}:${this.account}:identity/${props.domainName}`,
        ],
      }),
    )

    // Data Lambda (sidebar REST API)
    const dataLambda = new NodejsFunction(this, 'DataLambda', {
      entry: path.join(__dirname, '../../chat-service/src/data-handler.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      timeout: Duration.seconds(30),
      environment: {
        ...tableEnv,
        ANTHROPIC_API_KEY_SECRET_ARN: anthropicApiKeySecret.secretArn,
        DROPBOX_SIGN_API_KEY_SECRET_ARN: dropboxSignApiKeySecret.secretArn,
        EARNNEST_API_KEY_SECRET_ARN: earnnestApiKeySecret.secretArn,
      },
      bundling: bundlingOptions,
    })

    anthropicApiKeySecret.grantRead(dataLambda)
    dropboxSignApiKeySecret.grantRead(dataLambda)
    earnnestApiKeySecret.grantRead(dataLambda)
    props.userProfileTable.grantReadWriteData(dataLambda)
    props.notificationsTable.grantReadData(dataLambda)
    props.searchResultsTable.grantReadData(dataLambda)
    props.viewingsTable.grantReadData(dataLambda)
    props.viewingsTable.grantWriteData(dataLambda)
    props.documentsTable.grantReadWriteData(dataLambda)
    props.documentBucket.grantReadWrite(dataLambda)
    props.offersTable.grantReadWriteData(dataLambda)

    // SES permission for buyer notification on agent response
    dataLambda.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['ses:SendEmail'],
        resources: [
          `arn:aws:ses:${this.region}:${this.account}:identity/${props.domainName}`,
        ],
      }),
    )

    const cognitoAuthorizer = new HttpJwtAuthorizer(
      'CognitoAuthorizer',
      `https://cognito-idp.${this.region}.amazonaws.com/${props.userPool.userPoolId}`,
      {
        jwtAudience: [props.userPoolClient.userPoolClientId],
      },
    )

    const chatIntegration = new HttpLambdaIntegration('ChatIntegration', chatLambda)
    const dataIntegration = new HttpLambdaIntegration('DataIntegration', dataLambda)

    // Create routes as children of this stack (avoids cyclic cross-stack reference)
    new apigwv2.HttpRoute(this, 'ChatRoute', {
      httpApi: props.httpApi,
      routeKey: apigwv2.HttpRouteKey.with('/chat', apigwv2.HttpMethod.POST),
      integration: chatIntegration,
      authorizer: cognitoAuthorizer,
    })

    new apigwv2.HttpRoute(this, 'OffersRoute', {
      httpApi: props.httpApi,
      routeKey: apigwv2.HttpRouteKey.with('/offers', apigwv2.HttpMethod.GET),
      integration: dataIntegration,
      authorizer: cognitoAuthorizer,
    })

    new apigwv2.HttpRoute(this, 'NotificationsRoute', {
      httpApi: props.httpApi,
      routeKey: apigwv2.HttpRouteKey.with('/notifications', apigwv2.HttpMethod.GET),
      integration: dataIntegration,
      authorizer: cognitoAuthorizer,
    })

    new apigwv2.HttpRoute(this, 'ProfileRoute', {
      httpApi: props.httpApi,
      routeKey: apigwv2.HttpRouteKey.with('/profile', apigwv2.HttpMethod.GET),
      integration: dataIntegration,
      authorizer: cognitoAuthorizer,
    })

    new apigwv2.HttpRoute(this, 'ProfilePatchRoute', {
      httpApi: props.httpApi,
      routeKey: apigwv2.HttpRouteKey.with('/profile', apigwv2.HttpMethod.PATCH),
      integration: dataIntegration,
      authorizer: cognitoAuthorizer,
    })

    new apigwv2.HttpRoute(this, 'SearchResultsRoute', {
      httpApi: props.httpApi,
      routeKey: apigwv2.HttpRouteKey.with('/search-results', apigwv2.HttpMethod.GET),
      integration: dataIntegration,
      authorizer: cognitoAuthorizer,
    })

    new apigwv2.HttpRoute(this, 'ViewingsRoute', {
      httpApi: props.httpApi,
      routeKey: apigwv2.HttpRouteKey.with('/viewings', apigwv2.HttpMethod.GET),
      integration: dataIntegration,
      authorizer: cognitoAuthorizer,
    })

    new apigwv2.HttpRoute(this, 'ViewingsCancelRoute', {
      httpApi: props.httpApi,
      routeKey: apigwv2.HttpRouteKey.with('/viewings/cancel', apigwv2.HttpMethod.POST),
      integration: dataIntegration,
      authorizer: cognitoAuthorizer,
    })

    new apigwv2.HttpRoute(this, 'DocumentsListRoute', {
      httpApi: props.httpApi,
      routeKey: apigwv2.HttpRouteKey.with('/documents', apigwv2.HttpMethod.GET),
      integration: dataIntegration,
      authorizer: cognitoAuthorizer,
    })

    new apigwv2.HttpRoute(this, 'DocumentsUploadUrlRoute', {
      httpApi: props.httpApi,
      routeKey: apigwv2.HttpRouteKey.with('/documents/upload-url', apigwv2.HttpMethod.GET),
      integration: dataIntegration,
      authorizer: cognitoAuthorizer,
    })

    new apigwv2.HttpRoute(this, 'DocumentsConfirmRoute', {
      httpApi: props.httpApi,
      routeKey: apigwv2.HttpRouteKey.with('/documents', apigwv2.HttpMethod.POST),
      integration: dataIntegration,
      authorizer: cognitoAuthorizer,
    })

    new apigwv2.HttpRoute(this, 'DocumentsDownloadUrlRoute', {
      httpApi: props.httpApi,
      routeKey: apigwv2.HttpRouteKey.with('/documents/download-url', apigwv2.HttpMethod.GET),
      integration: dataIntegration,
      authorizer: cognitoAuthorizer,
    })

    // Unauthenticated — seller's agent clicks a link from email
    new apigwv2.HttpRoute(this, 'ViewingResponseRoute', {
      httpApi: props.httpApi,
      routeKey: apigwv2.HttpRouteKey.with('/viewing-response', apigwv2.HttpMethod.GET),
      integration: dataIntegration,
    })

    // Unauthenticated — Earnnest webhook (verified via HMAC in handler; active once API access granted)
    new apigwv2.HttpRoute(this, 'EarnnestWebhookRoute', {
      httpApi: props.httpApi,
      routeKey: apigwv2.HttpRouteKey.with('/webhooks/earnnest', apigwv2.HttpMethod.POST),
      integration: dataIntegration,
    })

    // Unauthenticated — Dropbox Sign webhook (no auth header; verified via HMAC in handler)
    new apigwv2.HttpRoute(this, 'DropboxSignWebhookRoute', {
      httpApi: props.httpApi,
      routeKey: apigwv2.HttpRouteKey.with('/webhooks/dropbox-sign', apigwv2.HttpMethod.POST),
      integration: dataIntegration,
    })

    // Unauthenticated — seller's agent disclosure upload flow
    new apigwv2.HttpRoute(this, 'SellerResponseInfoRoute', {
      httpApi: props.httpApi,
      routeKey: apigwv2.HttpRouteKey.with('/seller-response', apigwv2.HttpMethod.GET),
      integration: dataIntegration,
    })

    new apigwv2.HttpRoute(this, 'SellerResponseUploadUrlRoute', {
      httpApi: props.httpApi,
      routeKey: apigwv2.HttpRouteKey.with('/seller-response/upload-url', apigwv2.HttpMethod.GET),
      integration: dataIntegration,
    })

    new apigwv2.HttpRoute(this, 'SellerResponseConfirmRoute', {
      httpApi: props.httpApi,
      routeKey: apigwv2.HttpRouteKey.with('/seller-response/confirm', apigwv2.HttpMethod.POST),
      integration: dataIntegration,
    })

    // Unauthenticated — seller's agent downloads the PA and records their decision
    new apigwv2.HttpRoute(this, 'SellerResponseDownloadPaRoute', {
      httpApi: props.httpApi,
      routeKey: apigwv2.HttpRouteKey.with('/seller-response/download-pa', apigwv2.HttpMethod.GET),
      integration: dataIntegration,
    })

    new apigwv2.HttpRoute(this, 'SellerResponseDecisionRoute', {
      httpApi: props.httpApi,
      routeKey: apigwv2.HttpRouteKey.with('/seller-response/decision', apigwv2.HttpMethod.POST),
      integration: dataIntegration,
    })

    new CfnOutput(this, 'AnthropicModelId', {
      value: ANTHROPIC_MODEL_ID,
      description: 'Anthropic model used by the chat Lambda',
    })
  }
}
