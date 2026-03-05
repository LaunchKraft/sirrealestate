import type { Listing, Viewing } from './types'

export function purchaseAgreementSignedEmail(
  listingAddress: string,
  chatUrl: string,
): { subject: string; html: string } {
  const subject = `Purchase agreement signed — ${listingAddress}`
  const html = `
<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px">
  <h2 style="color:#1a56db">Purchase Agreement Signed</h2>
  <p>Great news! Your purchase agreement for the following property has been fully signed:</p>
  <p style="font-weight:600">${listingAddress}</p>
  <p>The signed document is now available in your SirRealtor account under My Documents. Your agent will submit it to the seller's agent to begin the closing process.</p>
  <a href="${chatUrl}" style="background:#1a56db;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block">
    Open SirRealtor →
  </a>
  <p style="color:#6b7280;font-size:12px;margin-top:24px">Sent via SirRealtor (sirrealtor.com)</p>
</body>
</html>`
  return { subject, html }
}

export function sellerDisclosureReceivedEmail(
  listingAddress: string,
  fileNames: string[],
  chatUrl: string,
): { subject: string; html: string } {
  const subject = `Seller's disclosure received for ${listingAddress}`
  const fileList = fileNames.map((f) => `<li>${f}</li>`).join('')
  const html = `
<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px">
  <h2 style="color:#1a56db">Seller's Disclosure Received</h2>
  <p>The seller's agent has uploaded disclosure document(s) for:</p>
  <p style="font-weight:600">${listingAddress}</p>
  <ul>${fileList}</ul>
  <p>You can review the document(s) in your SirRealtor account under My Documents.</p>
  <a href="${chatUrl}" style="background:#1a56db;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block">
    Open SirRealtor →
  </a>
</body>
</html>`
  return { subject, html }
}

export function earnestMoneyReceivedEmail(
  listingAddress: string,
  amount: number,
  chatUrl: string,
): { subject: string; html: string } {
  const subject = `Earnest money deposit received — ${listingAddress}`
  const html = `
<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px">
  <h2 style="color:#1a56db">Earnest Money Deposit Confirmed</h2>
  <p>Your earnest money deposit has been successfully received by escrow for:</p>
  <p style="font-weight:600">${listingAddress}</p>
  <p><strong>Amount:</strong> $${amount.toLocaleString()}</p>
  <p>The funds are now held in escrow and will be applied toward closing or returned per the terms of your purchase agreement.</p>
  <a href="${chatUrl}" style="background:#1a56db;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block">
    Open SirRealtor →
  </a>
  <p style="color:#6b7280;font-size:12px;margin-top:24px">Sent via SirRealtor (sirrealtor.com)</p>
</body>
</html>`
  return { subject, html }
}

export function newListingMatchEmail(listing: Listing, chatUrl: string): { subject: string; html: string } {
  const subject = `New match: ${listing.address} — $${listing.price.toLocaleString()}`
  const html = `
<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px">
  <h2 style="color:#1a56db">New Property Match Found</h2>
  <p>SirRealtor found a new listing that matches your search criteria:</p>
  <div style="border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin:16px 0">
    <h3 style="margin-top:0">${listing.address}</h3>
    <p><strong>Price:</strong> $${listing.price.toLocaleString()}</p>
    <p><strong>Bedrooms:</strong> ${listing.bedrooms} &nbsp; <strong>Bathrooms:</strong> ${listing.bathrooms}</p>
    ${listing.sqft ? `<p><strong>Size:</strong> ${listing.sqft.toLocaleString()} sqft</p>` : ''}
    ${listing.listingUrl ? `<p><a href="${listing.listingUrl}" style="color:#1a56db">View Listing →</a></p>` : ''}
  </div>
  <a href="${chatUrl}" style="background:#1a56db;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block">
    Chat with SirRealtor →
  </a>
  <p style="color:#6b7280;font-size:12px;margin-top:24px">You're receiving this because you enabled monitoring for this search. Reply to opt out.</p>
</body>
</html>`
  return { subject, html }
}

export function viewingRequestToAgentEmail(
  viewing: Viewing,
  buyerEmail: string,
  buyerName: string,
  availabilitySlots: string[],
): { subject: string; html: string } {
  const baseUrl = 'https://app.sirrealtor.com/viewing-response'

  const slotButtons = availabilitySlots
    .map((slot, i) => {
      const url = `${baseUrl}?viewingId=${encodeURIComponent(viewing.viewingId)}&slot=${i}`
      const label = new Date(slot).toLocaleString('en-US', {
        weekday: 'long', month: 'long', day: 'numeric',
        hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
      })
      return `<a href="${url}" style="display:block;background:#1a56db;color:white;padding:12px 20px;border-radius:6px;text-decoration:none;margin-bottom:10px;font-size:15px">${label}</a>`
    })
    .join('\n  ')

  const noneUrl = `${baseUrl}?viewingId=${encodeURIComponent(viewing.viewingId)}&slot=none`

  const subject = `Viewing Request: ${viewing.listingAddress}`
  const html = `
<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px">
  <h2>Viewing Request via SirRealtor</h2>
  <p>A buyer has requested to view your listing. Please select a time that works:</p>
  <div style="border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin:16px 0">
    <p><strong>Property:</strong> ${viewing.listingAddress}</p>
    <p><strong>Buyer:</strong> ${buyerName} &lt;${buyerEmail}&gt;</p>
  </div>
  <p><strong>Available times — click to confirm:</strong></p>
  ${slotButtons}
  <a href="${noneUrl}" style="display:block;background:#f3f4f6;color:#374151;padding:12px 20px;border-radius:6px;text-decoration:none;margin-bottom:10px;font-size:15px;border:1px solid #d1d5db">None of these times work</a>
  <p style="color:#6b7280;font-size:12px;margin-top:24px">Sent via SirRealtor (sirrealtor.com). Clicking a time confirms it directly — no login required.</p>
</body>
</html>`
  return { subject, html }
}

export function viewingConfirmationToBuyerEmail(
  viewing: Viewing,
  chatUrl: string,
): { subject: string; html: string } {
  const subject = `Viewing Requested: ${viewing.listingAddress}`
  const html = `
<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px">
  <h2 style="color:#1a56db">Viewing Request Sent</h2>
  <p>Your viewing request has been sent to the seller's agent!</p>
  <div style="border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin:16px 0">
    <p><strong>Property:</strong> ${viewing.listingAddress}</p>
    ${viewing.proposedDateTime ? `<p><strong>Proposed Time:</strong> ${viewing.proposedDateTime}</p>` : ''}
    ${viewing.agentName ? `<p><strong>Agent:</strong> ${viewing.agentName}</p>` : ''}
    <p><strong>Status:</strong> Awaiting confirmation</p>
  </div>
  <p>We'll follow up once the agent responds. You can also check your viewing status in chat.</p>
  <a href="${chatUrl}" style="background:#1a56db;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block">
    Open Chat →
  </a>
  <p style="color:#6b7280;font-size:12px;margin-top:24px">Sent via SirRealtor (sirrealtor.com)</p>
</body>
</html>`
  return { subject, html }
}

export function viewingAgentResponseToBuyerEmail(
  viewing: Viewing,
  confirmed: boolean,
  chatUrl: string,
): { subject: string; html: string } {
  if (confirmed) {
    const subject = `Viewing Confirmed: ${viewing.listingAddress}`
    const html = `
<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px">
  <h2 style="color:#1a56db">Your Viewing is Confirmed!</h2>
  <p>${viewing.agentName ?? 'The seller\'s agent'} has accepted your viewing request.</p>
  <div style="border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin:16px 0">
    <p><strong>Property:</strong> ${viewing.listingAddress}</p>
    <p><strong>Confirmed Time:</strong> ${new Date(viewing.agentSelectedSlot!).toLocaleString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric',
      hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
    })}</p>
    ${viewing.agentName ? `<p><strong>Agent:</strong> ${viewing.agentName}</p>` : ''}
  </div>
  <a href="${chatUrl}" style="background:#1a56db;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block">
    Open Chat →
  </a>
  <p style="color:#6b7280;font-size:12px;margin-top:24px">Sent via SirRealtor (sirrealtor.com)</p>
</body>
</html>`
    return { subject, html }
  }

  const subject = `Viewing Update: ${viewing.listingAddress}`
  const html = `
<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px">
  <h2>None of Your Proposed Times Worked</h2>
  <p>${viewing.agentName ?? 'The seller\'s agent'} was unable to confirm any of your proposed times for <strong>${viewing.listingAddress}</strong>.</p>
  <p>You may want to reach out to the agent directly to find a time that works, or chat with SirRealtor to explore other options.</p>
  <a href="${chatUrl}" style="background:#1a56db;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block">
    Open Chat →
  </a>
  <p style="color:#6b7280;font-size:12px;margin-top:24px">Sent via SirRealtor (sirrealtor.com)</p>
</body>
</html>`
  return { subject, html }
}

export function viewingFeedbackRequestEmail(
  viewing: Viewing,
  chatUrl: string,
): { subject: string; html: string } {
  const subject = `How was your viewing at ${viewing.listingAddress}?`
  const html = `
<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px">
  <h2 style="color:#1a56db">How did the viewing go?</h2>
  <p>You recently viewed <strong>${viewing.listingAddress}</strong>. We'd love to know what you thought!</p>
  <p>Click below to share your feedback with SirRealtor and continue your search.</p>
  <a href="${chatUrl}" style="background:#1a56db;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block">
    Share Feedback →
  </a>
  <p style="color:#6b7280;font-size:12px;margin-top:24px">Sent via SirRealtor (sirrealtor.com)</p>
</body>
</html>`
  return { subject, html }
}
