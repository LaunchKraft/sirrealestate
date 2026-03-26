// ci trigger 10
import * as path from 'path'
import { Duration, Stack, CfnOutput, type StackProps } from 'aws-cdk-lib'
import * as lambda from 'aws-cdk-lib/aws-lambda'
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs'
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2'
import { HttpLambdaIntegration, WebSocketLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations'
import { HttpJwtAuthorizer, WebSocketLambdaAuthorizer } from 'aws-cdk-lib/aws-apigatewayv2-authorizers'
import * as cognito from 'aws-cdk-lib/aws-cognito'
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb'
import * as s3 from 'aws-cdk-lib/aws-s3'
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager'
import * as iam from 'aws-cdk-lib/aws-iam'
import * as scheduler from 'aws-cdk-lib/aws-scheduler'
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
  favoritesTable: dynamodb.Table
  waitlistTable: dynamodb.Table
  listingClicksTable: dynamodb.Table
  closingsTable: dynamodb.Table
  messageFeedbackTable: dynamodb.Table
  wsConnectionsTable: dynamodb.Table
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
      FAVORITES_TABLE: props.favoritesTable.tableName,
      WAITLIST_TABLE: props.waitlistTable.tableName,
      LISTING_CLICKS_TABLE: props.listingClicksTable.tableName,
      CLOSINGS_TABLE: props.closingsTable.tableName,
      MESSAGE_FEEDBACK_TABLE: props.messageFeedbackTable.tableName,
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

    // Document Generator Lambda — invoked async by the chat Lambda to avoid
    // the 30-second API Gateway timeout during PDF generation + Dropbox Sign calls
    const documentGeneratorLambda = new NodejsFunction(this, 'DocumentGeneratorLambda', {
      entry: path.join(__dirname, '../../chat-service/src/document-generator.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      timeout: Duration.seconds(180),
      environment: {
        ...tableEnv,
        DROPBOX_SIGN_API_KEY_SECRET_ARN: dropboxSignApiKeySecret.secretArn,
      },
      bundling: { externalModules: [], nodeModules: ['pdfkit'] },
    })

    dropboxSignApiKeySecret.grantRead(documentGeneratorLambda)
    props.offersTable.grantReadWriteData(documentGeneratorLambda)
    props.closingsTable.grantReadWriteData(documentGeneratorLambda)
    props.documentsTable.grantReadWriteData(documentGeneratorLambda)
    props.documentBucket.grantReadWrite(documentGeneratorLambda)
    // SES permission for submit_offer (emails seller's agent and buyer)
    documentGeneratorLambda.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['ses:SendEmail'],
        resources: [
          `arn:aws:ses:${this.region}:${this.account}:identity/${props.domainName}`,
        ],
      }),
    )

    // Closing Reminder Lambda — runs daily to send SES deadline reminders
    const closingReminderLambda = new NodejsFunction(this, 'ClosingReminderLambda', {
      entry: path.join(__dirname, '../../chat-service/src/closing-reminder.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      timeout: Duration.seconds(120),
      environment: {
        CLOSINGS_TABLE: props.closingsTable.tableName,
        USER_PROFILE_TABLE: props.userProfileTable.tableName,
      },
      bundling: bundlingOptions,
    })

    props.closingsTable.grantReadWriteData(closingReminderLambda)
    props.userProfileTable.grantReadData(closingReminderLambda)
    closingReminderLambda.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['ses:SendEmail'],
        resources: [`arn:aws:ses:${this.region}:${this.account}:identity/${props.domainName}`],
      }),
    )

    // EventBridge Scheduler for daily closing reminders at 8am UTC
    const reminderSchedulerRole = new iam.Role(this, 'ClosingReminderSchedulerRole', {
      assumedBy: new iam.ServicePrincipal('scheduler.amazonaws.com'),
    })
    closingReminderLambda.grantInvoke(reminderSchedulerRole)

    new scheduler.CfnSchedule(this, 'DailyClosingReminderSchedule', {
      name: 'SirRealtor-DailyClosingReminder',
      scheduleExpression: 'cron(0 8 * * ? *)',
      scheduleExpressionTimezone: 'UTC',
      flexibleTimeWindow: { mode: 'OFF' },
      target: {
        arn: closingReminderLambda.functionArn,
        roleArn: reminderSchedulerRole.roleArn,
      },
    })

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
        SES_TEST_RECIPIENT: 'tim@sirrealtor.com',
        SEARCH_WORKER_FUNCTION_NAME: props.searchWorkerLambda.functionName,
        DOCUMENT_GENERATOR_FUNCTION_NAME: documentGeneratorLambda.functionName,
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

    // Permission to invoke the search worker and document generator Lambdas
    props.searchWorkerLambda.grantInvoke(chatLambda)
    documentGeneratorLambda.grantInvoke(chatLambda)

    // Grant chat Lambda read/write access to document bucket and documents table
    // (generate_purchase_agreement writes the PDF to S3 and creates a Documents record)
    props.documentBucket.grantReadWrite(chatLambda)
    props.documentsTable.grantReadWriteData(chatLambda)
    props.offersTable.grantReadWriteData(chatLambda)
    props.waitlistTable.grantReadWriteData(chatLambda)
    props.listingClicksTable.grantReadWriteData(chatLambda)
    props.closingsTable.grantReadWriteData(chatLambda)

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
        AGENT_EMAIL_BCC: 'noreply@sirrealtor.com',
        SES_TEST_RECIPIENT: 'tim@sirrealtor.com',
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
    props.favoritesTable.grantReadWriteData(dataLambda)
    props.waitlistTable.grantReadWriteData(dataLambda)
    props.listingClicksTable.grantReadWriteData(dataLambda)
    props.closingsTable.grantReadWriteData(dataLambda)
    props.messageFeedbackTable.grantReadWriteData(dataLambda)

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

    new apigwv2.HttpRoute(this, 'ClosingsRoute', {
      httpApi: props.httpApi,
      routeKey: apigwv2.HttpRouteKey.with('/closings', apigwv2.HttpMethod.GET),
      integration: dataIntegration,
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

    new apigwv2.HttpRoute(this, 'SearchProfileDeleteRoute', {
      httpApi: props.httpApi,
      routeKey: apigwv2.HttpRouteKey.with('/search-profiles/{profileId}', apigwv2.HttpMethod.DELETE),
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

    new apigwv2.HttpRoute(this, 'FavoritesListRoute', {
      httpApi: props.httpApi,
      routeKey: apigwv2.HttpRouteKey.with('/favorites', apigwv2.HttpMethod.GET),
      integration: dataIntegration,
      authorizer: cognitoAuthorizer,
    })

    new apigwv2.HttpRoute(this, 'FavoritesToggleRoute', {
      httpApi: props.httpApi,
      routeKey: apigwv2.HttpRouteKey.with('/favorites/toggle', apigwv2.HttpMethod.POST),
      integration: dataIntegration,
      authorizer: cognitoAuthorizer,
    })

    // Unauthenticated — waitlist routes
    new apigwv2.HttpRoute(this, 'WaitlistPostRoute', {
      httpApi: props.httpApi,
      routeKey: apigwv2.HttpRouteKey.with('/waitlist', apigwv2.HttpMethod.POST),
      integration: dataIntegration,
    })

    new apigwv2.HttpRoute(this, 'WaitlistCheckRoute', {
      httpApi: props.httpApi,
      routeKey: apigwv2.HttpRouteKey.with('/waitlist/check', apigwv2.HttpMethod.GET),
      integration: dataIntegration,
    })

    new apigwv2.HttpRoute(this, 'StatsRoute', {
      httpApi: props.httpApi,
      routeKey: apigwv2.HttpRouteKey.with('/stats', apigwv2.HttpMethod.GET),
      integration: dataIntegration,
      authorizer: cognitoAuthorizer,
    })

    new apigwv2.HttpRoute(this, 'MessageFeedbackRoute', {
      httpApi: props.httpApi,
      routeKey: apigwv2.HttpRouteKey.with('/chat/feedback', apigwv2.HttpMethod.POST),
      integration: dataIntegration,
      authorizer: cognitoAuthorizer,
    })

    new apigwv2.HttpRoute(this, 'StatsListingClickRoute', {
      httpApi: props.httpApi,
      routeKey: apigwv2.HttpRouteKey.with('/stats/listing-click', apigwv2.HttpMethod.POST),
      integration: dataIntegration,
      authorizer: cognitoAuthorizer,
    })

    new apigwv2.HttpRoute(this, 'WaitlistAcceptRoute', {
      httpApi: props.httpApi,
      routeKey: apigwv2.HttpRouteKey.with('/waitlist/accept', apigwv2.HttpMethod.POST),
      integration: dataIntegration,
    })

    // -------------------------------------------------------------------------
    // WebSocket API — no 29s timeout, connection-scoped chat sessions
    // -------------------------------------------------------------------------

    // Authorizer Lambda: validates Cognito ID token from ?token= query param on $connect
    const wsAuthorizerLambda = new NodejsFunction(this, 'WsAuthorizerLambda', {
      entry: path.join(__dirname, '../../chat-service/src/ws-authorizer.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      timeout: Duration.seconds(10),
      environment: {
        COGNITO_USER_POOL_ID: props.userPool.userPoolId,
        COGNITO_USER_POOL_CLIENT_ID: props.userPoolClient.userPoolClientId,
      },
      bundling: bundlingOptions,
    })

    // WebSocket chat Lambda — handles $connect, $disconnect, and $default
    const chatWsLambda = new NodejsFunction(this, 'ChatWsLambda', {
      entry: path.join(__dirname, '../../chat-service/src/ws-handler.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      timeout: Duration.minutes(3),
      memorySize: 512,
      environment: {
        ANTHROPIC_MODEL_ID,
        ANTHROPIC_API_KEY_SECRET_ARN: anthropicApiKeySecret.secretArn,
        DROPBOX_SIGN_API_KEY_SECRET_ARN: dropboxSignApiKeySecret.secretArn,
        EARNNEST_API_KEY_SECRET_ARN: earnnestApiKeySecret.secretArn,
        AGENT_EMAIL_BCC: 'noreply@sirrealtor.com',
        SES_TEST_RECIPIENT: 'tim@sirrealtor.com',
        WS_CONNECTIONS_TABLE: props.wsConnectionsTable.tableName,
        SEARCH_WORKER_FUNCTION_NAME: props.searchWorkerLambda.functionName,
        DOCUMENT_GENERATOR_FUNCTION_NAME: documentGeneratorLambda.functionName,
        ...tableEnv,
      },
      bundling: bundlingOptions,
    })

    anthropicApiKeySecret.grantRead(chatWsLambda)
    dropboxSignApiKeySecret.grantRead(chatWsLambda)
    props.wsConnectionsTable.grantReadWriteData(chatWsLambda)
    props.userProfileTable.grantReadWriteData(chatWsLambda)
    props.searchResultsTable.grantReadData(chatWsLambda)
    props.notificationsTable.grantWriteData(chatWsLambda)
    props.viewingsTable.grantReadWriteData(chatWsLambda)
    props.documentBucket.grantReadWrite(chatWsLambda)
    props.documentsTable.grantReadWriteData(chatWsLambda)
    props.offersTable.grantReadWriteData(chatWsLambda)
    props.waitlistTable.grantReadWriteData(chatWsLambda)
    props.listingClicksTable.grantReadWriteData(chatWsLambda)
    props.closingsTable.grantReadWriteData(chatWsLambda)
    props.searchWorkerLambda.grantInvoke(chatWsLambda)
    documentGeneratorLambda.grantInvoke(chatWsLambda)
    chatWsLambda.addToRolePolicy(new iam.PolicyStatement({
      actions: ['ses:SendEmail'],
      resources: [`arn:aws:ses:${this.region}:${this.account}:identity/${props.domainName}`],
    }))

    // Allow chatWsLambda to invoke itself asynchronously (bypasses 29s API GW timeout)
    chatWsLambda.addToRolePolicy(new iam.PolicyStatement({
      actions: ['lambda:InvokeFunction'],
      resources: [chatWsLambda.functionArn],
    }))
    // Disable async retries — duplicate processing would cause double responses
    chatWsLambda.configureAsyncInvoke({ maximumRetryAttempts: 0 })

    const wsAuthorizer = new WebSocketLambdaAuthorizer('WsAuthorizer', wsAuthorizerLambda, {
      identitySource: ['route.request.querystring.token'],
    })

    const wsApi = new apigwv2.WebSocketApi(this, 'ChatWsApi', {
      apiName: 'sirrealtor-chat-ws',
      connectRouteOptions: {
        authorizer: wsAuthorizer,
        integration: new WebSocketLambdaIntegration('WsConnectIntegration', chatWsLambda),
      },
      disconnectRouteOptions: {
        integration: new WebSocketLambdaIntegration('WsDisconnectIntegration', chatWsLambda),
      },
      defaultRouteOptions: {
        integration: new WebSocketLambdaIntegration('WsDefaultIntegration', chatWsLambda),
      },
    })

    const wsStage = new apigwv2.WebSocketStage(this, 'ChatWsStage', {
      webSocketApi: wsApi,
      stageName: 'prod',
      autoDeploy: true,
    })

    // Allow chatWsLambda to push messages back to connected clients
    chatWsLambda.addToRolePolicy(new iam.PolicyStatement({
      actions: ['execute-api:ManageConnections'],
      resources: [`arn:aws:execute-api:${this.region}:${this.account}:${wsApi.apiId}/${wsStage.stageName}/*`],
    }))

    // Callback URL used in Phase 2 by ApiGatewayManagementApiClient
    const wsCallbackUrl = `https://${wsApi.apiId}.execute-api.${this.region}.amazonaws.com/${wsStage.stageName}`
    chatWsLambda.addEnvironment('WS_CALLBACK_URL', wsCallbackUrl)

    new CfnOutput(this, 'WebSocketUrl', {
      value: `wss://${wsApi.apiId}.execute-api.${this.region}.amazonaws.com/${wsStage.stageName}`,
      description: 'VITE_WS_URL — WebSocket chat endpoint',
    })

    new CfnOutput(this, 'AnthropicModelId', {
      value: ANTHROPIC_MODEL_ID,
      description: 'Anthropic model used by the chat Lambda',
    })
  }
}
