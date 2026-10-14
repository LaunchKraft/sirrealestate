import { Stack, RemovalPolicy, CfnOutput, SecretValue, type StackProps } from 'aws-cdk-lib'
import * as cognito from 'aws-cdk-lib/aws-cognito'
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb'
import * as iam from 'aws-cdk-lib/aws-iam'
import * as lambda from 'aws-cdk-lib/aws-lambda'
import * as ssm from 'aws-cdk-lib/aws-ssm'
import type { Construct } from 'constructs'

interface AuthStackProps extends StackProps {
  appDomain: string
  domainName: string
}

// ---------------------------------------------------------------------------
// Email templates
// Cognito supports inline-styled HTML. {####} is the code placeholder.
// Both sign-up verification and forgot-password flows use the verification template.
// ---------------------------------------------------------------------------

const PRIMARY = '#00BFEB'
const PRIMARY_DARK = '#0097BD'
const BG = '#f0f7fb'
const CARD_BG = '#ffffff'
const TEXT = '#1a2233'
const MUTED = '#64748b'
const BORDER = '#e2e8f0'

function emailShell(appDomain: string, title: string, body: string): string {
  return `<body style="margin:0;padding:0;background:${BG};font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:${BG};">
<tr><td align="center" style="padding:40px 16px;">
<table width="520" cellpadding="0" cellspacing="0" style="background:${CARD_BG};border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
  <tr>
    <td style="background:linear-gradient(135deg,${PRIMARY},${PRIMARY_DARK});padding:28px 40px;text-align:center;">
      <img src="https://${appDomain}/logo.png" alt="SirRealtor" width="140" style="display:block;margin:0 auto;" />
    </td>
  </tr>
  <tr>
    <td style="padding:36px 40px;">
      <h1 style="margin:0 0 12px;font-size:20px;font-weight:700;color:${TEXT};">${title}</h1>
      ${body}
    </td>
  </tr>
  <tr>
    <td style="padding:20px 40px;border-top:1px solid ${BORDER};text-align:center;">
      <p style="margin:0;font-size:12px;color:${MUTED};">&copy; 2026 SirRealtor &bull; <a href="https://${appDomain}" style="color:${PRIMARY};text-decoration:none;">app.sirrealtor.com</a></p>
    </td>
  </tr>
</table>
</td></tr>
</table>
</body>`
}

function verificationEmailBody(appDomain: string): string {
  return emailShell(
    appDomain,
    'Verify your email address',
    `<p style="margin:0 0 20px;font-size:15px;color:${MUTED};line-height:1.6;">
      Use the code below to continue. It expires shortly.
    </p>
    <div style="background:${BG};border-radius:10px;padding:24px;text-align:center;margin:0 0 24px;">
      <span style="font-size:38px;font-weight:700;letter-spacing:10px;color:${PRIMARY};">{####}</span>
    </div>
    <p style="margin:0;font-size:13px;color:${MUTED};">
      If you didn't create a SirRealtor account, you can safely ignore this email.
    </p>`,
  )
}

function invitationEmailBody(appDomain: string): string {
  return emailShell(
    appDomain,
    'Your SirRealtor account is ready',
    `<p style="margin:0 0 20px;font-size:15px;color:${MUTED};line-height:1.6;">
      An account has been created for you. Sign in with your email and the temporary password below, then choose a new password.
    </p>
    <div style="background:${BG};border-radius:10px;padding:20px 24px;margin:0 0 24px;">
      <p style="margin:0 0 4px;font-size:12px;color:${MUTED};text-transform:uppercase;letter-spacing:1px;">Username</p>
      <p style="margin:0 0 16px;font-size:15px;color:${TEXT};">{username}</p>
      <p style="margin:0 0 4px;font-size:12px;color:${MUTED};text-transform:uppercase;letter-spacing:1px;">Temporary password</p>
      <p style="margin:0;font-size:20px;font-weight:700;color:${TEXT};letter-spacing:2px;">{####}</p>
    </div>
    <a href="https://${appDomain}" style="display:inline-block;background:${PRIMARY};color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;padding:12px 28px;border-radius:8px;">Sign in to SirRealtor</a>`,
  )
}

// launchr (LaunchKraft's internal launch tool, AWS account 521554525147) runs the
// Sir Realtor beta: waitlist, invites, and the /beta-signup flow. Its public handler
// assumes this fixed-name role to create invited users with AdminCreateUser.
const LAUNCHR_ACCOUNT_ID = '521554525147'

// Owned by SirRealtor-Data. Referenced by name rather than a cross-stack export so
// this stack doesn't take a deploy-order dependency on the data stack.
const WAITLIST_TABLE_NAME = 'SirRealtor-Waitlist'

export class AuthStack extends Stack {
  readonly userPool: cognito.UserPool
  readonly userPoolClient: cognito.UserPoolClient

  constructor(scope: Construct, id: string, props: AuthStackProps) {
    super(scope, id, props)

    const googleClientId = ssm.StringParameter.valueForStringParameter(this, '/sirrealtor/google-client-id')

    const waitlistTable = dynamodb.Table.fromTableName(this, 'WaitlistTable', WAITLIST_TABLE_NAME)

    // Users created via AdminCreateUser are launchr beta signups (or accounts made from
    // the admin app) — flag them as beta in the waitlist table, which chat-service reads
    // to enable the beta prompt, save_beta_feedback, and test pre-approval letters.
    // Never blocks the signup: a failed write is logged and the user is still created.
    const preSignUpLambda = new lambda.Function(this, 'PreSignUpLambda', {
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'index.handler',
      environment: { WAITLIST_TABLE: waitlistTable.tableName },
      code: lambda.Code.fromInline(`
        const { DynamoDBClient, UpdateItemCommand } = require('@aws-sdk/client-dynamodb');
        const dynamo = new DynamoDBClient({});
        exports.handler = async (event) => {
          if (event.triggerSource !== 'PreSignUp_AdminCreateUser') return event;
          const email = (event.request.userAttributes.email || '').toLowerCase();
          if (!email) return event;
          try {
            await dynamo.send(new UpdateItemCommand({
              TableName: process.env.WAITLIST_TABLE,
              Key: { email: { S: email } },
              UpdateExpression: 'SET #s = :s, createdAt = if_not_exists(createdAt, :now), #src = if_not_exists(#src, :src)',
              ExpressionAttributeNames: { '#s': 'status', '#src': 'source' },
              ExpressionAttributeValues: {
                ':s': { S: 'accepted_beta' },
                ':now': { S: new Date().toISOString() },
                ':src': { S: 'launchr' },
              },
            }));
          } catch (err) {
            console.error('Failed to flag beta user', email, err);
          }
          return event;
        };
      `),
    })
    waitlistTable.grantWriteData(preSignUpLambda)

    this.userPool = new cognito.UserPool(this, 'UserPool', {
      // Closed beta: accounts are only created server-side — by launchr for invited
      // beta users (see LaunchrBetaSignupRole below) or from the admin app.
      selfSignUpEnabled: false,
      lambdaTriggers: {
        preSignUp: preSignUpLambda,
      },
      // Email is the only identifier — no separate username field exposed to users.
      signInAliases: { email: true },
      autoVerify: { email: true },
      // Case-insensitive sign-in: user@example.com == User@Example.COM.
      // This is immutable after pool creation — cannot be changed without replacement.
      signInCaseSensitive: false,
      email: cognito.UserPoolEmail.withSES({
        fromEmail: `noreply@${props.domainName}`,
        fromName: 'Sir Realtor',
        sesRegion: this.region,
        sesVerifiedDomain: props.domainName,
      }),
      userVerification: {
        emailSubject: 'Your SirRealtor verification code',
        emailBody: verificationEmailBody(props.appDomain),
        emailStyle: cognito.VerificationEmailStyle.CODE,
      },
      userInvitation: {
        emailSubject: 'Your SirRealtor account is ready',
        emailBody: invitationEmailBody(props.appDomain),
      },
      removalPolicy: RemovalPolicy.RETAIN,
    })

    const googleProvider = new cognito.UserPoolIdentityProviderGoogle(this, 'GoogleProvider', {
      userPool: this.userPool,
      clientId: googleClientId,
      // fromSecretNameV2 generates an ARN-based reference that omits the random suffix,
      // causing ResourceNotFoundException. Use SecretValue.secretsManager() directly for
      // a name-based dynamic reference: {{resolve:secretsmanager:sirrealtor/google-client-secret}}
      clientSecretValue: SecretValue.secretsManager('sirrealtor/google-client-secret'),
      scopes: ['openid', 'email', 'profile'],
      attributeMapping: {
        email: cognito.ProviderAttribute.GOOGLE_EMAIL,
        givenName: cognito.ProviderAttribute.GOOGLE_GIVEN_NAME,
        familyName: cognito.ProviderAttribute.GOOGLE_FAMILY_NAME,
      },
    })

    // Cognito hosted domain — required for the OAuth 2.0 authorization code grant flow.
    // Domain prefix must be globally unique.
    const COGNITO_DOMAIN_PREFIX = 'sirrealtor'
    this.userPool.addDomain('CognitoDomain', {
      cognitoDomain: { domainPrefix: COGNITO_DOMAIN_PREFIX },
    })

    this.userPoolClient = new cognito.UserPoolClient(this, 'UserPoolClient', {
      userPool: this.userPool,
      // generateSecret must be false — browser clients cannot keep secrets.
      generateSecret: false,
      authFlows: {
        userSrp: true,
      },
      supportedIdentityProviders: [
        cognito.UserPoolClientIdentityProvider.COGNITO,
        cognito.UserPoolClientIdentityProvider.GOOGLE,
      ],
      oAuth: {
        flows: {
          authorizationCodeGrant: true,
        },
        scopes: [
          cognito.OAuthScope.OPENID,
          cognito.OAuthScope.EMAIL,
          cognito.OAuthScope.PROFILE,
          cognito.OAuthScope.COGNITO_ADMIN,
        ],
        callbackUrls: [
          `https://${props.appDomain}`,
          'http://localhost:5173',
        ],
        logoutUrls: [
          `https://${props.appDomain}`,
          'http://localhost:5173',
        ],
      },
    })
    this.userPoolClient.node.addDependency(googleProvider)

    // Assumed by launchr's public handler when an invited beta user completes
    // app.sirrealtor.com/beta-signup. Fixed role name — launchr builds the ARN from
    // the account id alone.
    const launchrBetaSignupRole = new iam.Role(this, 'LaunchrBetaSignupRole', {
      roleName: 'launchr-beta-signup',
      assumedBy: new iam.AccountPrincipal(LAUNCHR_ACCOUNT_ID),
      description: 'Assumed by launchr to create Cognito users for accepted beta signups',
    })
    launchrBetaSignupRole.addToPolicy(new iam.PolicyStatement({
      actions: ['cognito-idp:AdminCreateUser', 'cognito-idp:AdminSetUserPassword', 'cognito-idp:AdminGetUser'],
      resources: [this.userPool.userPoolArn],
    }))

    new CfnOutput(this, 'UserPoolId', {
      value: this.userPool.userPoolId,
      description: 'VITE_COGNITO_USER_POOL_ID',
    })

    new CfnOutput(this, 'UserPoolClientId', {
      value: this.userPoolClient.userPoolClientId,
      description: 'VITE_COGNITO_USER_POOL_CLIENT_ID',
    })

    new CfnOutput(this, 'Region', {
      value: this.region,
      description: 'AWS region — same as VITE_COGNITO_USER_POOL_ID prefix',
    })

    new CfnOutput(this, 'CognitoOAuthDomain', {
      value: `${COGNITO_DOMAIN_PREFIX}.auth.${this.region}.amazoncognito.com`,
      description: 'VITE_COGNITO_OAUTH_DOMAIN',
    })
  }
}
