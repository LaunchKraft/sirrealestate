import { Stack, RemovalPolicy, CfnOutput, type StackProps } from 'aws-cdk-lib'
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb'
import * as s3 from 'aws-cdk-lib/aws-s3'
import type { Construct } from 'constructs'

export class DataStack extends Stack {
  readonly userProfileTable: dynamodb.Table
  readonly searchResultsTable: dynamodb.Table
  readonly notificationsTable: dynamodb.Table
  readonly viewingsTable: dynamodb.Table
  readonly documentBucket: s3.Bucket
  readonly documentsTable: dynamodb.Table
  readonly offersTable: dynamodb.Table
  readonly favoritesTable: dynamodb.Table
  readonly waitlistTable: dynamodb.Table
  readonly listingClicksTable: dynamodb.Table

  constructor(scope: Construct, id: string, props: StackProps) {
    super(scope, id, props)

    this.userProfileTable = new dynamodb.Table(this, 'UserProfileTable', {
      tableName: 'SirRealtor-UserProfile',
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.RETAIN,
    })
    this.userProfileTable.addGlobalSecondaryIndex({
      indexName: 'email-index',
      partitionKey: { name: 'email', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    })

    this.searchResultsTable = new dynamodb.Table(this, 'SearchResultsTable', {
      tableName: 'SirRealtor-SearchResults',
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'profileIdListingId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.RETAIN,
    })
    this.searchResultsTable.addGlobalSecondaryIndex({
      indexName: 'userId-matchedAt-index',
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'matchedAt', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    })

    this.notificationsTable = new dynamodb.Table(this, 'NotificationsTable', {
      tableName: 'SirRealtor-Notifications',
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'notificationId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.RETAIN,
    })

    this.viewingsTable = new dynamodb.Table(this, 'ViewingsTable', {
      tableName: 'SirRealtor-Viewings',
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'viewingId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.RETAIN,
    })
    this.viewingsTable.addGlobalSecondaryIndex({
      indexName: 'userId-status-index',
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'status', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    })

    this.documentBucket = new s3.Bucket(this, 'DocumentBucket', {
      bucketName: `sirrealtor-documents-${this.account}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      removalPolicy: RemovalPolicy.RETAIN,
      cors: [
        {
          allowedMethods: [s3.HttpMethods.GET, s3.HttpMethods.PUT],
          allowedOrigins: ['https://app.sirrealtor.com', 'http://localhost:5173'],
          allowedHeaders: ['*'],
          maxAge: 3000,
        },
      ],
    })

    this.documentsTable = new dynamodb.Table(this, 'DocumentsTable', {
      tableName: 'SirRealtor-Documents',
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'documentId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.RETAIN,
    })

    this.offersTable = new dynamodb.Table(this, 'OffersTable', {
      tableName: 'SirRealtor-Offers',
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'offerId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.RETAIN,
    })
    // Enables unauthenticated lookup by seller's agent response token
    this.offersTable.addGlobalSecondaryIndex({
      indexName: 'sellerResponseToken-index',
      partitionKey: { name: 'sellerResponseToken', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    })

    this.favoritesTable = new dynamodb.Table(this, 'FavoritesTable', {
      tableName: 'SirRealtor-Favorites',
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'listingId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.RETAIN,
    })

    this.waitlistTable = new dynamodb.Table(this, 'WaitlistTable', {
      tableName: 'SirRealtor-Waitlist',
      partitionKey: { name: 'email', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.RETAIN,
    })
    this.waitlistTable.addGlobalSecondaryIndex({
      indexName: 'status-index',
      partitionKey: { name: 'status', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'createdAt', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    })

    this.listingClicksTable = new dynamodb.Table(this, 'ListingClicksTable', {
      tableName: 'SirRealtor-ListingClicks',
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'clickedAt', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.RETAIN,
    })

    new CfnOutput(this, 'UserProfileTableName', { value: this.userProfileTable.tableName })
    new CfnOutput(this, 'SearchResultsTableName', { value: this.searchResultsTable.tableName })
    new CfnOutput(this, 'NotificationsTableName', { value: this.notificationsTable.tableName })
    new CfnOutput(this, 'ViewingsTableName', { value: this.viewingsTable.tableName })
    new CfnOutput(this, 'DocumentBucketName', { value: this.documentBucket.bucketName })
    new CfnOutput(this, 'DocumentsTableName', { value: this.documentsTable.tableName })
    new CfnOutput(this, 'OffersTableName', { value: this.offersTable.tableName })
    new CfnOutput(this, 'FavoritesTableName', { value: this.favoritesTable.tableName })
    new CfnOutput(this, 'WaitlistTableName', { value: this.waitlistTable.tableName })
    new CfnOutput(this, 'ListingClicksTableName', { value: this.listingClicksTable.tableName })
  }
}
