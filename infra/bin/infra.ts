#!/usr/bin/env node
import 'source-map-support/register'
import { App } from 'aws-cdk-lib'
import { getConfig } from '../lib/config'
import { DnsStack } from '../lib/dns-stack'
import { CertStack } from '../lib/cert-stack'
import { UiStack } from '../lib/ui-stack'
import { AuthStack } from '../lib/auth-stack'
import { ApiStack } from '../lib/api-stack'
import { DataStack } from '../lib/data-stack'
import { SesStack } from '../lib/ses-stack'
import { ChatServiceStack } from '../lib/chat-service-stack'
import { SearchWorkerStack } from '../lib/search-worker-stack'
import { AdminDnsStack } from '../lib/admin-dns-stack'
import { AdminCertStack } from '../lib/admin-cert-stack'
import { AdminUiStack } from '../lib/admin-ui-stack'
import { AdminAuthStack } from '../lib/admin-auth-stack'
import { AdminApiStack } from '../lib/admin-api-stack'
import { AdminServiceStack } from '../lib/admin-service-stack'
import { WwwStack } from '../lib/www-stack'
import * as acm from 'aws-cdk-lib/aws-certificatemanager'

const app = new App()
const config = getConfig(app)

const prodEnv = { account: config.prodAccount, region: config.prodRegion }
const certEnv = { account: config.prodAccount, region: config.certRegion }

const dnsStack = new DnsStack(app, 'SirRealtor-Dns', {
  env: prodEnv,
  appDomain: config.appDomain,
  apiDomain: config.apiDomain,
  crossRegionReferences: true,
})

// CertStack must deploy to us-east-1 — required by CloudFront.
// DNS delegation for both subdomains must exist before deploying.
const certStack = new CertStack(app, 'SirRealtor-Cert', {
  env: certEnv,
  appDomain: config.appDomain,
  apiDomain: config.apiDomain,
  appHostedZone: dnsStack.appHostedZone,
  apiHostedZone: dnsStack.apiHostedZone,
  crossRegionReferences: true,
})
certStack.addDependency(dnsStack)

const uiStack = new UiStack(app, 'SirRealtor-Ui', {
  env: prodEnv,
  appDomain: config.appDomain,
  certificate: certStack.appCertificate,
  hostedZone: dnsStack.appHostedZone,
})
uiStack.addDependency(certStack)

const authStack = new AuthStack(app, 'SirRealtor-Auth', {
  env: prodEnv,
  appDomain: config.appDomain,
  domainName: config.baseDomain,
})
authStack.addDependency(dnsStack)

const apiStack = new ApiStack(app, 'SirRealtor-Api', {
  env: prodEnv,
  appDomain: config.appDomain,
  apiDomain: config.apiDomain,
  certificate: certStack.apiCertificate,
  hostedZone: dnsStack.apiHostedZone,
})
apiStack.addDependency(certStack)

// DynamoDB tables — deploy before Chat and SearchWorker stacks
const dataStack = new DataStack(app, 'SirRealtor-Data', { env: prodEnv })

// SES domain identity — uses app hosted zone for DKIM DNS records
const sesStack = new SesStack(app, 'SirRealtor-Ses', {
  env: prodEnv,
  domainName: config.baseDomain,
})
authStack.addDependency(sesStack)

const searchWorkerStack = new SearchWorkerStack(app, 'SirRealtor-SearchWorker', {
  env: prodEnv,
  userProfileTable: dataStack.userProfileTable,
  searchResultsTable: dataStack.searchResultsTable,
  notificationsTable: dataStack.notificationsTable,
  viewingsTable: dataStack.viewingsTable,
  domainName: config.baseDomain,
})
searchWorkerStack.addDependency(dataStack)
searchWorkerStack.addDependency(sesStack)

const chatServiceStack = new ChatServiceStack(app, 'SirRealtor-Chat', {
  env: prodEnv,
  httpApi: apiStack.httpApi,
  userPool: authStack.userPool,
  userPoolClient: authStack.userPoolClient,
  domainName: config.baseDomain,
  userProfileTable: dataStack.userProfileTable,
  searchResultsTable: dataStack.searchResultsTable,
  notificationsTable: dataStack.notificationsTable,
  viewingsTable: dataStack.viewingsTable,
  searchWorkerLambda: searchWorkerStack.searchWorkerLambda,
  documentBucket: dataStack.documentBucket,
  documentsTable: dataStack.documentsTable,
  offersTable: dataStack.offersTable,
  favoritesTable: dataStack.favoritesTable,
})
chatServiceStack.addDependency(apiStack)
chatServiceStack.addDependency(authStack)
chatServiceStack.addDependency(dataStack)
chatServiceStack.addDependency(sesStack)
chatServiceStack.addDependency(searchWorkerStack)

// ---------------------------------------------------------------------------
// Admin console — separate stacks, separate Cognito pool, separate API GW
// ---------------------------------------------------------------------------

const adminDnsStack = new AdminDnsStack(app, 'SirRealtor-AdminDns', {
  env: prodEnv,
  adminDomain: config.adminDomain,
  adminApiDomain: config.adminApiDomain,
  crossRegionReferences: true,
})

// MANUAL STEP after AdminDns deploys: add NS delegation records in parent account.

// CertStack must deploy to us-east-1 — required by CloudFront.
const adminCertStack = new AdminCertStack(app, 'SirRealtor-AdminCert', {
  env: certEnv,
  adminDomain: config.adminDomain,
  adminApiDomain: config.adminApiDomain,
  adminHostedZone: adminDnsStack.adminHostedZone,
  adminApiHostedZone: adminDnsStack.adminApiHostedZone,
  crossRegionReferences: true,
})
adminCertStack.addDependency(adminDnsStack)

const adminUiStack = new AdminUiStack(app, 'SirRealtor-AdminUi', {
  env: prodEnv,
  adminDomain: config.adminDomain,
  certificate: adminCertStack.adminCertificate,
  hostedZone: adminDnsStack.adminHostedZone,
  crossRegionReferences: true,
})
adminUiStack.addDependency(adminCertStack)

const adminAuthStack = new AdminAuthStack(app, 'SirRealtor-AdminAuth', {
  env: prodEnv,
  adminDomain: config.adminDomain,
})

const adminApiStack = new AdminApiStack(app, 'SirRealtor-AdminApi', {
  env: prodEnv,
  adminDomain: config.adminDomain,
  adminApiDomain: config.adminApiDomain,
  certificate: adminCertStack.adminApiCertificate,
  hostedZone: adminDnsStack.adminApiHostedZone,
  crossRegionReferences: true,
})
adminApiStack.addDependency(adminCertStack)

const adminServiceStack = new AdminServiceStack(app, 'SirRealtor-AdminService', {
  env: prodEnv,
  httpApi: adminApiStack.httpApi,
  adminUserPool: adminAuthStack.userPool,
  adminUserPoolClient: adminAuthStack.userPoolClient,
  consumerUserPoolId: authStack.userPool.userPoolId,
  userProfileTable: dataStack.userProfileTable,
  searchResultsTable: dataStack.searchResultsTable,
  viewingsTable: dataStack.viewingsTable,
  documentsTable: dataStack.documentsTable,
  offersTable: dataStack.offersTable,
})
adminServiceStack.addDependency(adminApiStack)
adminServiceStack.addDependency(adminAuthStack)
adminServiceStack.addDependency(dataStack)
adminServiceStack.addDependency(authStack)

// ---------------------------------------------------------------------------
// Marketing website — sirrealtor.com and www.sirrealtor.com
// ---------------------------------------------------------------------------
// The certificate must be pre-created manually in ACM (us-east-1) and its ARN
// stored as the WWW_CERT_ARN GitHub secret. See deploy-www-infra.yml for the
// workflow that deploys this stack and step-by-step cert creation instructions.
// ---------------------------------------------------------------------------
if (config.wwwCertArn) {
  const wwwCert = acm.Certificate.fromCertificateArn(app, 'WwwCert', config.wwwCertArn)
  new WwwStack(app, 'SirRealtor-Www', {
    env: prodEnv,
    baseDomain: config.baseDomain,
    certificate: wwwCert,
  })
}
