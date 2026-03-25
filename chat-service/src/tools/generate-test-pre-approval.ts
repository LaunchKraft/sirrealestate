import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb'
import { marshall } from '@aws-sdk/util-dynamodb'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { randomUUID } from 'crypto'
import type { UserDocument } from '../types'
import { generatePreApprovalLetter } from '../forms/templates/pre-approval-letter'

const dynamo = new DynamoDBClient({})
const s3 = new S3Client({})

export const definition = {
  name: 'generate_test_pre_approval',
  description:
    'Generate a test pre-approval letter PDF for beta testing purposes. ' +
    'Creates a realistic-looking but clearly watermarked test pre-approval letter and adds it ' +
    "to the user's documents with the correct pre_approval_letter type and extracted data, " +
    'so the rest of the offer workflow functions as it would with a real letter. ' +
    'Only offer this to beta users when they do not yet have a pre-approval letter uploaded.',
  input_schema: {
    type: 'object',
    properties: {
      borrowerName: {
        type: 'string',
        description: "The borrower's full legal name as it should appear on the letter.",
      },
      lenderName: {
        type: 'string',
        description: 'Name of the lender (can be real or made up, e.g. "Meridian Home Lending").',
      },
      approvedAmount: {
        type: 'number',
        description: 'The pre-approved loan amount in dollars (e.g. 450000).',
      },
    },
    required: ['borrowerName', 'lenderName', 'approvedAmount'],
  },
}

export async function execute(
  userId: string,
  input: { borrowerName: string; lenderName: string; approvedAmount: number },
): Promise<{ message: string }> {
  // Expiration: 60 days from today
  const expiry = new Date()
  expiry.setDate(expiry.getDate() + 60)
  const expirationDate = expiry.toISOString().split('T')[0]

  const pdfBuffer = await generatePreApprovalLetter({
    borrowerName: input.borrowerName,
    lenderName: input.lenderName,
    approvedAmount: input.approvedAmount,
    expirationDate,
  })

  const documentId = randomUUID()
  const fileName = `test-pre-approval-${input.borrowerName.replace(/\s+/g, '-').toLowerCase()}.pdf`
  const s3Key = `${userId}/${documentId}`

  await s3.send(
    new PutObjectCommand({
      Bucket: process.env.DOCUMENT_BUCKET_NAME!,
      Key: s3Key,
      Body: pdfBuffer,
      ContentType: 'application/pdf',
    }),
  )

  const now = new Date().toISOString()
  const doc: UserDocument = {
    userId,
    documentId,
    fileName,
    contentType: 'application/pdf',
    sizeBytes: pdfBuffer.length,
    s3Key,
    uploadedAt: now,
    documentType: 'pre_approval_letter',
    extractedData: {
      approvedAmount: input.approvedAmount,
      expirationDate,
      lenderName: input.lenderName,
      borrowerNames: [input.borrowerName],
      loanType: 'Conventional 30-Year Fixed',
    },
  }

  await dynamo.send(
    new PutItemCommand({
      TableName: process.env.DOCUMENTS_TABLE!,
      Item: marshall(doc, { removeUndefinedValues: true }),
    }),
  )

  const k = Math.round(input.approvedAmount / 1000)
  return {
    message:
      `Test pre-approval letter generated successfully! ` +
      `${input.borrowerName} is pre-approved for up to $${k}k from ${input.lenderName} ` +
      `(expires ${expiry.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}). ` +
      `The document has been added to your Documents and is ready to use in the offer workflow.`,
  }
}
