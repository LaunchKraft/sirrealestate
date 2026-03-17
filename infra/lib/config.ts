import type { App } from 'aws-cdk-lib'

export interface SirRealtorConfig {
  prodAccount: string
  prodRegion: string
  certRegion: string
  baseDomain: string      // sirrealtor.com
  appDomain: string       // app.sirrealtor.com  (app-<env>.sirrealtor.com for lower envs)
  apiDomain: string       // api.sirrealtor.com  (api-<env>.sirrealtor.com for lower envs)
  adminDomain: string     // admin.sirrealtor.com
  adminApiDomain: string  // admin-api.sirrealtor.com
  wwwCertArn?: string     // pre-created ACM cert ARN for sirrealtor.com + www.sirrealtor.com
}

export function getConfig(app: App): SirRealtorConfig {
  const prodAccount = app.node.tryGetContext('prodAccount') as string | undefined
  const prodRegion = app.node.tryGetContext('prodRegion') as string | undefined
  const certRegion = app.node.tryGetContext('certRegion') as string | undefined
  const baseDomain = app.node.tryGetContext('domainName') as string | undefined
  // Optional: set to 'staging', 'dev', etc. for lower environments.
  // Omit (or leave empty) for production.
  const envName = app.node.tryGetContext('envName') as string | undefined
  const wwwCertArn = app.node.tryGetContext('wwwCertArn') as string | undefined

  if (!prodAccount || prodAccount === 'REPLACE_WITH_PROD_ACCOUNT_ID') {
    throw new Error('cdk.json: "prodAccount" must be set to your AWS account ID')
  }
  if (!prodRegion) throw new Error('cdk.json: "prodRegion" is required')
  if (!certRegion) throw new Error('cdk.json: "certRegion" is required')
  if (!baseDomain) throw new Error('cdk.json: "domainName" is required')

  const envSuffix = envName ? `-${envName}` : ''

  return {
    prodAccount,
    prodRegion,
    certRegion,
    baseDomain,
    appDomain: `app${envSuffix}.${baseDomain}`,
    apiDomain: `api${envSuffix}.${baseDomain}`,
    adminDomain: `admin${envSuffix}.${baseDomain}`,
    adminApiDomain: `admin-api${envSuffix}.${baseDomain}`,
    wwwCertArn,
  }
}
