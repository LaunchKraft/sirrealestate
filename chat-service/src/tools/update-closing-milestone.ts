import { DynamoDBClient, GetItemCommand, UpdateItemCommand } from '@aws-sdk/client-dynamodb'
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb'
import type { Closing, ClosingDeadlines } from '../types'

const dynamo = new DynamoDBClient({})

export const definition = {
  name: 'update_closing_milestone',
  description:
    'Mark a closing milestone as complete and/or update closing details such as title company, ' +
    'escrow number, or contract deadlines. Call this whenever the user reports completing a step ' +
    'in the closing process (e.g. inspection done, title commitment received, clear to close, etc.). ' +
    'Valid milestoneIds: inspection_scheduled, inspection_complete, inspection_objection_sent, ' +
    'inspection_resolved, title_commitment_received, hoa_docs_received, appraisal_ordered, ' +
    'appraisal_complete, appraisal_resolved, loan_conditions_met, clear_to_close, ' +
    'insurance_bound, closing_disclosure_reviewed, final_walkthrough_complete, ' +
    'funds_wired, documents_signed, deed_recorded, keys_received.',
  input_schema: {
    type: 'object',
    properties: {
      closingId: {
        type: 'string',
        description: 'The closingId to update.',
      },
      milestoneId: {
        type: 'string',
        description: 'The milestone being completed. Omit if only updating metadata fields.',
      },
      titleCompany: {
        type: 'string',
        description: 'Title company name.',
      },
      titleContactEmail: {
        type: 'string',
        description: 'Title company contact email.',
      },
      escrowNumber: {
        type: 'string',
        description: 'Escrow / file number assigned by the title company.',
      },
      notes: {
        type: 'string',
        description: 'Free-text notes about this closing.',
      },
      deadlines: {
        type: 'object',
        description: 'Updated contract deadline dates (ISO date strings, YYYY-MM-DD). Merged into existing deadlines.',
        properties: {
          inspectionObjectionDeadline: { type: 'string' },
          inspectionResolutionDeadline: { type: 'string' },
          titleObjectionDeadline: { type: 'string' },
          appraisalDeadline: { type: 'string' },
          appraisalObjectionDeadline: { type: 'string' },
          appraisalResolutionDeadline: { type: 'string' },
          loanConditionsDeadline: { type: 'string' },
          newLoanAvailabilityDeadline: { type: 'string' },
          closingDate: { type: 'string' },
        },
      },
    },
    required: ['closingId'],
  },
}

interface UpdateClosingMilestoneInput {
  closingId: string
  milestoneId?: string
  titleCompany?: string
  titleContactEmail?: string
  escrowNumber?: string
  notes?: string
  deadlines?: Partial<ClosingDeadlines>
}

export async function execute(
  userId: string,
  input: UpdateClosingMilestoneInput,
): Promise<{ message: string } | { error: string }> {
  const result = await dynamo.send(
    new GetItemCommand({
      TableName: process.env.CLOSINGS_TABLE!,
      Key: marshall({ userId, closingId: input.closingId }),
    }),
  )
  if (!result.Item) return { error: `Closing ${input.closingId} not found.` }

  const closing = unmarshall(result.Item) as Closing
  const now = new Date().toISOString()

  if (input.milestoneId) {
    closing.milestones[input.milestoneId] = now
  }
  if (input.titleCompany !== undefined) closing.titleCompany = input.titleCompany
  if (input.titleContactEmail !== undefined) closing.titleContactEmail = input.titleContactEmail
  if (input.escrowNumber !== undefined) closing.escrowNumber = input.escrowNumber
  if (input.notes !== undefined) closing.notes = input.notes
  if (input.deadlines) {
    closing.deadlines = { ...closing.deadlines, ...input.deadlines }
  }
  closing.updatedAt = now

  await dynamo.send(
    new UpdateItemCommand({
      TableName: process.env.CLOSINGS_TABLE!,
      Key: marshall({ userId, closingId: input.closingId }),
      UpdateExpression: [
        'SET milestones = :m',
        'deadlines = :d',
        'updatedAt = :u',
        input.titleCompany !== undefined ? 'titleCompany = :tc' : null,
        input.titleContactEmail !== undefined ? 'titleContactEmail = :tce' : null,
        input.escrowNumber !== undefined ? 'escrowNumber = :en' : null,
        input.notes !== undefined ? 'notes = :n' : null,
      ].filter(Boolean).join(', '),
      ExpressionAttributeValues: {
        ...marshall({
          ':m': closing.milestones,
          ':d': closing.deadlines,
          ':u': now,
        }, { removeUndefinedValues: true }),
        ...(input.titleCompany !== undefined ? marshall({ ':tc': input.titleCompany }) : {}),
        ...(input.titleContactEmail !== undefined ? marshall({ ':tce': input.titleContactEmail }) : {}),
        ...(input.escrowNumber !== undefined ? marshall({ ':en': input.escrowNumber }) : {}),
        ...(input.notes !== undefined ? marshall({ ':n': input.notes }) : {}),
      },
    }),
  )

  const label = input.milestoneId ? ` Milestone "${input.milestoneId}" marked complete.` : ''
  return { message: `Closing ${input.closingId} updated.${label}` }
}
