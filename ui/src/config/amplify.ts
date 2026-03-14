import type { ResourcesConfig } from 'aws-amplify'

export const amplifyConfig: ResourcesConfig = {
  Auth: {
    Cognito: {
      userPoolId: import.meta.env.VITE_COGNITO_USER_POOL_ID,
      userPoolClientId: import.meta.env.VITE_COGNITO_USER_POOL_CLIENT_ID,
      loginWith: {
        oauth: {
          domain: import.meta.env.VITE_COGNITO_OAUTH_DOMAIN,
          scopes: ['openid', 'email', 'profile'],
          redirectSignIn: ['https://app.sirrealtor.com', 'http://localhost:5173'],
          redirectSignOut: ['https://app.sirrealtor.com', 'http://localhost:5173'],
          responseType: 'code',
        },
      },
    },
  },
}
