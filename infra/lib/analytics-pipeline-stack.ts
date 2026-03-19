import * as path from 'path'
import { Duration, Stack, RemovalPolicy, CfnOutput, type StackProps } from 'aws-cdk-lib'
import * as lambda from 'aws-cdk-lib/aws-lambda'
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs'
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb'
import * as s3 from 'aws-cdk-lib/aws-s3'
import * as iam from 'aws-cdk-lib/aws-iam'
import * as firehose from 'aws-cdk-lib/aws-kinesisfirehose'
import * as glue from 'aws-cdk-lib/aws-glue'
import * as athena from 'aws-cdk-lib/aws-athena'
import { DynamoEventSource } from 'aws-cdk-lib/aws-lambda-event-sources'
import type { Construct } from 'constructs'

const FIREHOSE_STREAM_NAME = 'SirRealtor-BusinessEvents'

interface AnalyticsPipelineStackProps extends StackProps {
  viewingsTable: dynamodb.Table
  offersTable: dynamodb.Table
  userProfileTable: dynamodb.Table
  searchResultsTable: dynamodb.Table
}

export class AnalyticsPipelineStack extends Stack {
  constructor(scope: Construct, id: string, props: AnalyticsPipelineStackProps) {
    super(scope, id, props)

    // -------------------------------------------------------------------------
    // Phase 2 — S3 data lake + Kinesis Firehose + stream processor Lambda
    // -------------------------------------------------------------------------

    const dataLakeBucket = new s3.Bucket(this, 'DataLakeBucket', {
      bucketName: `sirrealtor-data-lake-${this.account}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      removalPolicy: RemovalPolicy.RETAIN,
    })

    // IAM role for Firehose to write to S3
    const firehoseRole = new iam.Role(this, 'FirehoseRole', {
      assumedBy: new iam.ServicePrincipal('firehose.amazonaws.com'),
    })
    dataLakeBucket.grantWrite(firehoseRole)

    // Kinesis Firehose delivery stream — buffers and writes GZIP'd JSONL to S3
    // Records are partitioned by ingestion date: year=/month=/day=/
    const deliveryStream = new firehose.CfnDeliveryStream(this, 'BusinessEventsStream', {
      deliveryStreamName: FIREHOSE_STREAM_NAME,
      deliveryStreamType: 'DirectPut',
      extendedS3DestinationConfiguration: {
        bucketArn: dataLakeBucket.bucketArn,
        roleArn: firehoseRole.roleArn,
        prefix: 'business-events/year=!{timestamp:yyyy}/month=!{timestamp:MM}/day=!{timestamp:dd}/',
        errorOutputPrefix: 'business-events-errors/!{timestamp:yyyy}/!{timestamp:MM}/!{timestamp:dd}/!{firehose:error-output-type}/',
        bufferingHints: { intervalInSeconds: 300, sizeInMBs: 5 },
        compressionFormat: 'GZIP',
      },
    })

    // DynamoDB stream processor Lambda
    const streamProcessor = new NodejsFunction(this, 'StreamProcessorLambda', {
      entry: path.join(__dirname, '../../chat-service/src/analytics-stream-processor.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      timeout: Duration.seconds(60),
      environment: { FIREHOSE_STREAM_NAME },
      bundling: { externalModules: [] },
    })

    streamProcessor.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['firehose:PutRecord', 'firehose:PutRecordBatch'],
        resources: [deliveryStream.attrArn],
      }),
    )

    // Attach DynamoDB streams as event sources
    const eventSourceConfig = {
      startingPosition: lambda.StartingPosition.TRIM_HORIZON,
      batchSize: 100,
      bisectBatchOnError: true,
      retryAttempts: 3,
    }

    streamProcessor.addEventSource(new DynamoEventSource(props.viewingsTable, eventSourceConfig))
    streamProcessor.addEventSource(new DynamoEventSource(props.offersTable, eventSourceConfig))
    streamProcessor.addEventSource(new DynamoEventSource(props.userProfileTable, eventSourceConfig))
    streamProcessor.addEventSource(new DynamoEventSource(props.searchResultsTable, eventSourceConfig))

    // -------------------------------------------------------------------------
    // Phase 3 — Glue catalog + Athena WorkGroup + named queries for QuickSight
    // -------------------------------------------------------------------------

    // Glue database
    const glueDatabase = new glue.CfnDatabase(this, 'AnalyticsDatabase', {
      catalogId: this.account,
      databaseInput: {
        name: 'sirrealtor_analytics',
        description: 'Sir Realtor business event data lake',
      },
    })

    // Glue table for business_events — partition projection avoids manual partition registration
    const glueTable = new glue.CfnTable(this, 'BusinessEventsTable', {
      catalogId: this.account,
      databaseName: 'sirrealtor_analytics',
      tableInput: {
        name: 'business_events',
        tableType: 'EXTERNAL_TABLE',
        parameters: {
          'projection.enabled': 'true',
          'projection.year.type': 'integer',
          'projection.year.range': '2025,2030',
          'projection.month.type': 'integer',
          'projection.month.range': '1,12',
          'projection.month.digits': '2',
          'projection.day.type': 'integer',
          'projection.day.range': '1,31',
          'projection.day.digits': '2',
          'storage.location.template':
            `s3://${dataLakeBucket.bucketName}/business-events/year=\${year}/month=\${month}/day=\${day}/`,
          'classification': 'json',
        },
        storageDescriptor: {
          location: `s3://${dataLakeBucket.bucketName}/business-events/`,
          inputFormat: 'org.apache.hadoop.mapred.TextInputFormat',
          outputFormat: 'org.apache.hadoop.hive.ql.io.HiveIgnoreKeyTextOutputFormat',
          serdeInfo: {
            serializationLibrary: 'org.openx.data.jsonserde.JsonSerDe',
            parameters: { 'ignore.malformed.json': 'true' },
          },
          columns: [
            { name: 'event_type', type: 'string' },
            { name: 'user_id', type: 'string' },
            { name: 'timestamp', type: 'string' },
            { name: 'properties', type: 'string' },
          ],
          compressed: true,
        },
        partitionKeys: [
          { name: 'year', type: 'string' },
          { name: 'month', type: 'string' },
          { name: 'day', type: 'string' },
        ],
      },
    })
    glueTable.addDependency(glueDatabase)

    // Athena WorkGroup — results go to the data lake bucket
    const workGroup = new athena.CfnWorkGroup(this, 'AnalyticsWorkGroup', {
      name: 'SirRealtor-Analytics',
      workGroupConfiguration: {
        resultConfiguration: {
          outputLocation: `s3://${dataLakeBucket.bucketName}/athena-results/`,
        },
        enforceWorkGroupConfiguration: true,
      },
    })

    // Named query: full conversion funnel (search → viewing → offer → close)
    const funnelQuery = new athena.CfnNamedQuery(this, 'FunnelQuery', {
      database: 'sirrealtor_analytics',
      workGroup: 'SirRealtor-Analytics',
      name: 'conversion_funnel',
      description: 'Full conversion funnel: search result → viewing → offer → accepted',
      queryString: [
        'SELECT',
        '  user_id,',
        "  MAX(CASE WHEN event_type = 'search_result_matched' THEN 1 ELSE 0 END) AS had_search_result,",
        "  MAX(CASE WHEN event_type = 'viewing_requested'    THEN 1 ELSE 0 END) AS requested_viewing,",
        "  MAX(CASE WHEN event_type = 'viewing_confirmed'    THEN 1 ELSE 0 END) AS confirmed_viewing,",
        "  MAX(CASE WHEN event_type = 'offer_created'        THEN 1 ELSE 0 END) AS created_offer,",
        "  MAX(CASE WHEN event_type = 'offer_submitted'      THEN 1 ELSE 0 END) AS submitted_offer,",
        "  MAX(CASE WHEN event_type = 'offer_accepted'       THEN 1 ELSE 0 END) AS accepted_offer",
        'FROM sirrealtor_analytics.business_events',
        'GROUP BY user_id',
        'ORDER BY user_id',
      ].join('\n'),
    })
    funnelQuery.addDependency(workGroup)

    // Named query: agent responsiveness (viewings requested vs confirmed by day)
    const agentQuery = new athena.CfnNamedQuery(this, 'AgentResponsivenessQuery', {
      database: 'sirrealtor_analytics',
      workGroup: 'SirRealtor-Analytics',
      name: 'agent_responsiveness',
      description: 'Viewings requested vs confirmed by day with confirmation rate',
      queryString: [
        'SELECT',
        '  year,',
        '  month,',
        '  day,',
        "  COUNT(CASE WHEN event_type = 'viewing_requested' THEN 1 END) AS requested,",
        "  COUNT(CASE WHEN event_type = 'viewing_confirmed' THEN 1 END) AS confirmed,",
        '  ROUND(',
        "    100.0 * COUNT(CASE WHEN event_type = 'viewing_confirmed' THEN 1 END)",
        "    / NULLIF(COUNT(CASE WHEN event_type = 'viewing_requested' THEN 1 END), 0),",
        '    1',
        '  ) AS confirmation_rate_pct',
        'FROM sirrealtor_analytics.business_events',
        "WHERE event_type IN ('viewing_requested', 'viewing_confirmed')",
        'GROUP BY year, month, day',
        'ORDER BY year, month, day',
      ].join('\n'),
    })
    agentQuery.addDependency(workGroup)

    // Named query: beta user engagement (events per user, ordered by activity)
    const betaQuery = new athena.CfnNamedQuery(this, 'BetaEngagementQuery', {
      database: 'sirrealtor_analytics',
      workGroup: 'SirRealtor-Analytics',
      name: 'beta_user_engagement',
      description: 'Event counts per beta user ordered by total activity',
      queryString: [
        'SELECT',
        '  user_id,',
        '  COUNT(*) AS total_events,',
        "  COUNT(CASE WHEN event_type = 'search_profile_created'  THEN 1 END) AS searches_created,",
        "  COUNT(CASE WHEN event_type = 'search_result_matched'   THEN 1 END) AS results_received,",
        "  COUNT(CASE WHEN event_type = 'viewing_requested'       THEN 1 END) AS viewings_requested,",
        "  COUNT(CASE WHEN event_type = 'offer_created'           THEN 1 END) AS offers_created,",
        "  COUNT(CASE WHEN event_type = 'offer_accepted'          THEN 1 END) AS offers_accepted,",
        '  MIN(timestamp) AS first_event_at,',
        '  MAX(timestamp) AS last_event_at',
        'FROM sirrealtor_analytics.business_events',
        'GROUP BY user_id',
        'ORDER BY total_events DESC',
      ].join('\n'),
    })
    betaQuery.addDependency(workGroup)

    // Named query: GA4 + Athena join for full listing click funnel (Phase 4)
    // Requires BigQuery Export enabled in GA4 and data synced to S3 or joined via Athena federated query
    const ga4JoinQuery = new athena.CfnNamedQuery(this, 'Ga4ListingClickQuery', {
      database: 'sirrealtor_analytics',
      workGroup: 'SirRealtor-Analytics',
      name: 'listing_click_to_offer_funnel',
      description: 'Join listing_site_click GA4 events with business events to measure click-to-offer conversion',
      queryString: [
        '-- Join in-app listing click events (from SirRealtor-ListingClicks table via a second Glue table)',
        '-- with business events to measure how listing clicks convert to viewings and offers.',
        '-- After enabling BigQuery Export in GA4, you can also join GA4 listing_site_click events here.',
        '--',
        '-- Example funnel by platform:',
        'SELECT',
        "  JSON_EXTRACT_SCALAR(properties, '$.platform') AS platform,",
        "  COUNT(DISTINCT user_id) AS users_clicked,",
        '  -- Join with viewing/offer data from business_events',
        "  COUNT(DISTINCT CASE WHEN event_type = 'viewing_requested' THEN user_id END) AS users_viewed,",
        "  COUNT(DISTINCT CASE WHEN event_type = 'offer_created' THEN user_id END) AS users_offered",
        'FROM sirrealtor_analytics.business_events',
        "WHERE event_type IN ('listing_site_click', 'viewing_requested', 'offer_created')",
        "  AND year >= '2025'",
        "GROUP BY JSON_EXTRACT_SCALAR(properties, '$.platform')",
        'ORDER BY users_clicked DESC',
      ].join('\n'),
    })
    ga4JoinQuery.addDependency(workGroup)

    new CfnOutput(this, 'DataLakeBucketName', {
      value: dataLakeBucket.bucketName,
      description: 'S3 data lake bucket for business events',
    })
    new CfnOutput(this, 'FirehoseStreamName', {
      value: FIREHOSE_STREAM_NAME,
      description: 'Kinesis Firehose delivery stream name',
    })
    new CfnOutput(this, 'AthenaWorkGroup', {
      value: 'SirRealtor-Analytics',
      description: 'Athena WorkGroup — connect QuickSight to this',
    })
    new CfnOutput(this, 'GlueDatabase', {
      value: 'sirrealtor_analytics',
      description: 'Glue database for Athena queries',
    })
  }
}
