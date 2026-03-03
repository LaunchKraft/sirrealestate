import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3'
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager'
import Anthropic from '@anthropic-ai/sdk'
import pdfParse from 'pdf-parse'
import type { DocumentType } from './taxonomy'
import { TAXONOMY } from './taxonomy'

const s3 = new S3Client({})
const secretsManager = new SecretsManagerClient({})

export interface ClassificationResult {
  documentType: DocumentType
  extractedData?: Record<string, unknown>
}

async function getAnthropicClient(): Promise<Anthropic> {
  const { SecretString } = await secretsManager.send(
    new GetSecretValueCommand({ SecretId: process.env.ANTHROPIC_API_KEY_SECRET_ARN! }),
  )
  return new Anthropic({ apiKey: SecretString! })
}

function buildPrompt(text: string): string {
  const typeDescriptions = TAXONOMY.map((entry) => {
    const fieldList = entry.fields
      .map((f) => `    - ${f.key} (${f.type}): ${f.description}`)
      .join('\n')
    return `Type: "${entry.type}"\nDescription: ${entry.description}\nFields:\n${fieldList}`
  }).join('\n\n')

  return `You are a document classifier. Classify the following document text and extract structured fields.

Known document types:
${typeDescriptions}

Rules:
- Only classify as a known type when you are confident; otherwise use "unknown"
- Omit fields that cannot be found in the document — do not guess or hallucinate values
- Respond with raw JSON only, no markdown fences or explanation

Required JSON format:
{
  "documentType": "<type or unknown>",
  "extractedData": { <field key-value pairs, omit if documentType is unknown> }
}

Document text:
${text}`
}

export async function classifyDocument(s3Key: string, _fileName: string): Promise<ClassificationResult> {
  try {
    // Fetch PDF from S3
    const s3Response = await s3.send(
      new GetObjectCommand({
        Bucket: process.env.DOCUMENT_BUCKET_NAME!,
        Key: s3Key,
      }),
    )

    const chunks: Uint8Array[] = []
    const stream = s3Response.Body as AsyncIterable<Uint8Array>
    for await (const chunk of stream) {
      chunks.push(chunk)
    }
    const buffer = Buffer.concat(chunks)

    // Extract text from PDF
    const parsed = await pdfParse(buffer)
    const text = parsed.text?.slice(0, 12_000) ?? ''

    if (!text.trim()) {
      return { documentType: 'unknown' }
    }

    // Call Claude Haiku for classification
    const client = await getAnthropicClient()
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      messages: [{ role: 'user', content: buildPrompt(text) }],
    })

    const textBlock = response.content.find((b) => b.type === 'text')
    if (!textBlock || textBlock.type !== 'text') {
      return { documentType: 'unknown' }
    }

    const result = JSON.parse(textBlock.text) as { documentType?: string; extractedData?: Record<string, unknown> }

    // Validate documentType is in taxonomy
    const knownTypes = TAXONOMY.map((e) => e.type as string)
    const documentType = knownTypes.includes(result.documentType ?? '')
      ? (result.documentType as DocumentType)
      : 'unknown'

    return {
      documentType,
      extractedData: documentType !== 'unknown' ? result.extractedData : undefined,
    }
  } catch {
    return { documentType: 'unknown' }
  }
}
