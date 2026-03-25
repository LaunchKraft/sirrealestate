import { DynamoDBClient, ScanCommand, UpdateItemCommand, GetItemCommand } from '@aws-sdk/client-dynamodb'
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb'
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses'
import type { Closing, UserProfile } from './types'
import { closingDeadlineReminderEmail } from './email-templates'

const dynamo = new DynamoDBClient({})
const ses = new SESClient({})

const REMINDER_THRESHOLDS = [7, 3, 1]

const DEADLINE_CONFIG: Record<string, { label: string; actionHint: string }> = {
  inspectionObjectionDeadline: {
    label: 'Inspection Objection',
    actionHint: 'Review the inspection report and submit your objection or waiver through Sir Realtor.',
  },
  inspectionResolutionDeadline: {
    label: 'Inspection Resolution',
    actionHint: 'Finalize the inspection resolution with the seller.',
  },
  titleObjectionDeadline: {
    label: 'Title Objection',
    actionHint: 'Review the title commitment and raise any objections.',
  },
  appraisalDeadline: {
    label: 'Appraisal',
    actionHint: 'Confirm the appraisal has been ordered and scheduled.',
  },
  appraisalObjectionDeadline: {
    label: 'Appraisal Objection',
    actionHint: 'Review the appraisal and raise any objections if the value came in below purchase price.',
  },
  loanConditionsDeadline: {
    label: 'Loan Conditions',
    actionHint: 'Ensure all lender conditions have been satisfied and submitted.',
  },
  newLoanAvailabilityDeadline: {
    label: 'Loan Availability',
    actionHint: 'Confirm your loan is approved and available for closing.',
  },
  closingDate: {
    label: 'Closing Date',
    actionHint: 'Prepare for closing: confirm your title company appointment, arrange wire transfer, and complete the final walkthrough.',
  },
}

function daysUntilDate(isoDate: string): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const deadline = new Date(isoDate + 'T00:00:00')
  return Math.ceil((deadline.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

function fmtDate(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  })
}

export async function handler(): Promise<void> {
  console.log('closing-reminder: starting scan')

  // Scan all closings
  const scanResult = await dynamo.send(
    new ScanCommand({ TableName: process.env.CLOSINGS_TABLE! }),
  )

  const closings = (scanResult.Items ?? []).map((item) => unmarshall(item) as Closing)
  console.log(`closing-reminder: found ${closings.length} closings`)

  for (const closing of closings) {
    // Skip completed closings
    if (closing.milestones?.['keys_received'] || closing.milestones?.['deed_recorded']) {
      continue
    }

    // Get user email
    const profileResult = await dynamo.send(
      new GetItemCommand({
        TableName: process.env.USER_PROFILE_TABLE!,
        Key: { userId: { S: closing.userId } },
        ProjectionExpression: 'email',
      }),
    )
    if (!profileResult.Item) continue
    const { email } = unmarshall(profileResult.Item) as Pick<UserProfile, 'email'>
    if (!email) continue

    const remindersSent = closing.remindersSent ?? {}

    for (const [deadlineKey, config] of Object.entries(DEADLINE_CONFIG)) {
      const deadlineDate = (closing.deadlines as Record<string, string | undefined>)[deadlineKey]
      if (!deadlineDate) continue

      const days = daysUntilDate(deadlineDate)

      for (const threshold of REMINDER_THRESHOLDS) {
        if (days !== threshold) continue

        const reminderKey = `${deadlineKey}_${threshold}d`
        if (remindersSent[reminderKey]) continue  // already sent

        // Send the reminder email
        const { subject, html } = closingDeadlineReminderEmail(
          closing.listingAddress,
          config.label,
          threshold,
          fmtDate(deadlineDate),
          config.actionHint,
        )

        await ses.send(
          new SendEmailCommand({
            Source: 'noreply@sirrealtor.com',
            Destination: { ToAddresses: [email] },
            Message: { Subject: { Data: subject }, Body: { Html: { Data: html } } },
          }),
        ).catch((err: unknown) => console.error(`SES send failed for ${reminderKey}`, err))

        // Record that we sent this reminder
        await dynamo.send(
          new UpdateItemCommand({
            TableName: process.env.CLOSINGS_TABLE!,
            Key: marshall({ userId: closing.userId, closingId: closing.closingId }),
            UpdateExpression: 'SET remindersSent.#key = :now, updatedAt = :now',
            ExpressionAttributeNames: { '#key': reminderKey },
            ExpressionAttributeValues: marshall({ ':now': new Date().toISOString() }),
          }),
        ).catch((err: unknown) => console.error(`Failed to record reminder ${reminderKey}`, err))

        console.log(`closing-reminder: sent ${reminderKey} to ${email} for closing ${closing.closingId}`)
      }
    }
  }

  console.log('closing-reminder: done')
}
