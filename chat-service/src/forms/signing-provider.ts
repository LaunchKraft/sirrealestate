import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager'

const secretsManager = new SecretsManagerClient({})
let cachedApiKey: string | null = null

// ─── Interface ──────────────────────────────────────────────────────────────

export interface SigningRequest {
  pdfBuffer: Buffer
  fileName: string
  title: string
  subject: string
  message: string
  signers: Array<{ name: string; email: string }>
  /** Key/value pairs passed through to the webhook payload for correlation. */
  metadata?: Record<string, string>
}

export interface SigningResult {
  /** Dropbox Sign signature_request_id — store on the Offer for webhook correlation. */
  signatureRequestId: string
  /** Signers will receive an email from Dropbox Sign with their signing link. */
}

export interface SigningProvider {
  createSignatureRequest(request: SigningRequest): Promise<SigningResult>
}

// ─── Dropbox Sign (HelloSign v3 REST API) ───────────────────────────────────

async function getDropboxSignApiKey(): Promise<string> {
  if (cachedApiKey) return cachedApiKey
  const { SecretString } = await secretsManager.send(
    new GetSecretValueCommand({ SecretId: process.env.DROPBOX_SIGN_API_KEY_SECRET_ARN! }),
  )
  cachedApiKey = SecretString!
  return cachedApiKey
}

export class DropboxSignProvider implements SigningProvider {
  async createSignatureRequest(request: SigningRequest): Promise<SigningResult> {
    const apiKey = await getDropboxSignApiKey()
    const authHeader = 'Basic ' + Buffer.from(`${apiKey}:`).toString('base64')

    // Build multipart form — Node 22 has native FormData + File globals
    const form = new FormData()
    form.append('title', request.title)
    form.append('subject', request.subject)
    form.append('message', request.message)
    form.append('test_mode', process.env.NODE_ENV !== 'production' ? '1' : '0')

    request.signers.forEach((signer, i) => {
      form.append(`signers[${i}][name]`, signer.name)
      form.append(`signers[${i}][email_address]`, signer.email)
      form.append(`signers[${i}][order]`, String(i))
    })

    if (request.metadata) {
      Object.entries(request.metadata).forEach(([k, v]) => {
        form.append(`metadata[${k}]`, v)
      })
    }

    form.append(
      'file[0]',
      new File([new Uint8Array(request.pdfBuffer)], request.fileName, { type: 'application/pdf' }),
      request.fileName,
    )

    const response = await fetch('https://api.hellosign.com/v3/signature_request/send', {
      method: 'POST',
      headers: { Authorization: authHeader },
      body: form,
    })

    if (!response.ok) {
      const body = await response.text()
      throw new Error(`Dropbox Sign API error ${response.status}: ${body}`)
    }

    const result = await response.json() as {
      signature_request: { signature_request_id: string }
    }
    return { signatureRequestId: result.signature_request.signature_request_id }
  }
}
