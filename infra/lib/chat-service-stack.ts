// ci trigger
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

const SYSTEM_PROMPT =
  'You are SirRealtor, an expert AI real estate agent. You help users find properties by ' +
  'understanding their needs through natural conversation. You can save search profiles, ' +
  'show recent property matches, schedule viewings, and collect feedback — all via tool use. ' +
  'At the start of each conversation, call get_user_profile to see what the user already has set up, ' +
  'and call get_pending_feedback to check for any viewings needing feedback. ' +
  'Be concise, proactive, and data-driven. When the user describes what they want, save a search ' +
  'profile and ask if they want to enable daily monitoring. ' +
  'Before scheduling a viewing, always ask the user for at least two available date/time options ' +
  'to offer the seller\'s agent — never call schedule_viewing without availabilitySlots. ' +
  'The user\'s email address is already known (provided in the User context below) — never ask for it. ' +
  'When the user shares their name, phone number, buyer status, or pre-approval details, call ' +
  'update_user_details immediately to save that information. ' +
  'If the user\'s firstName and lastName are not yet set, ask for their name before creating a search profile. ' +
  'Ask about whether they are a first-time home buyer, their current city/state, their desired city/state, ' +
  'and their preferred listing platform (Zillow, Redfin, or Realtor.com) — save all via update_user_details. ' +
  'Call get_documents when the user asks about their documents or budget, or when creating/updating a search profile. ' +
  'If a pre-approval letter is found, use its approvedAmount as the maxPrice ceiling when setting up search criteria. ' +
  'OFFER WORKFLOW: When the user books their first viewing, proactively say: "To be ready to make an offer if you love ' +
  'one of these homes, I\'ll start gathering what we\'ll need. Can you confirm the full legal name(s) of everyone who ' +
  'will be on the offer, and your current mailing address?" Save any name/address info via update_user_details. ' +
  'At the start of each conversation where viewings exist, call get_offers to check for open offer drafts and see ' +
  'what information is still missing. When the user expresses intent to offer on a listing, immediately call ' +
  'create_offer_draft — do not wait until all details are collected. Then use update_offer progressively as the user ' +
  'provides each piece of information. A complete offer requires: all buyers\' full legal name, street address, city, ' +
  'state, zip, phone, and email; financing type (cash requires proof-of-funds documents, financed requires a ' +
  'pre-approval letter plus lender name and loan type); offer price, earnest money amount, closing date, and ' +
  'contingency elections. For financed offers, call get_documents to check for an uploaded pre-approval letter and ' +
  'use its approvedAmount as the offer price ceiling. Set status to "ready" via update_offer once all required fields ' +
  'are complete. Guide the conversation toward completing one missing field at a time — do not ask for everything at once.'

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

    // Chat Lambda
    const chatLambda = new NodejsFunction(this, 'ChatLambda', {
      entry: path.join(__dirname, '../../chat-service/src/handler.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      timeout: Duration.seconds(60),
      environment: {
        ANTHROPIC_MODEL_ID,
        ANTHROPIC_API_KEY_SECRET_ARN: anthropicApiKeySecret.secretArn,
        SYSTEM_PROMPT,
        SEARCH_WORKER_FUNCTION_NAME: props.searchWorkerLambda.functionName,
        ...tableEnv,
      },
      bundling: bundlingOptions,
    })

    // Anthropic API key read permission
    anthropicApiKeySecret.grantRead(chatLambda)

    // DynamoDB permissions for chat lambda
    props.userProfileTable.grantReadWriteData(chatLambda)
    props.searchResultsTable.grantReadData(chatLambda)
    props.notificationsTable.grantWriteData(chatLambda)
    props.viewingsTable.grantReadWriteData(chatLambda)

    // Permission to invoke the search worker Lambda
    props.searchWorkerLambda.grantInvoke(chatLambda)

    // Grant chat Lambda read access to document bucket and documents table
    props.documentBucket.grantRead(chatLambda)
    props.documentsTable.grantReadData(chatLambda)
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
      },
      bundling: bundlingOptions,
    })

    anthropicApiKeySecret.grantRead(dataLambda)
    props.userProfileTable.grantReadWriteData(dataLambda)
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

    new CfnOutput(this, 'AnthropicModelId', {
      value: ANTHROPIC_MODEL_ID,
      description: 'Anthropic model used by the chat Lambda',
    })
  }
}
