import PostalMime from 'postal-mime';

/**
 * Receives every email sent to <token>@faturas.<domain> (Cloudflare Email
 * Routing, catch-all → this worker) and posts each attachment to REST
 * Finance, which reads it and leaves it waiting for the owner.
 *
 * One request per attachment, so no single request goes over the 12 MB the
 * server's nginx accepts. The app decides what is worth reading (PDFs and
 * invoice-sized photos) and which restaurant the token belongs to; this only
 * carries the mail across.
 */
export default {
  async email(message, env) {
    const email = await PostalMime.parse(message.raw);
    const attachments = (email.attachments || []).filter((a) => a.content && a.content.byteLength > 0);

    // Nothing attached: nothing to read. Accepted quietly, so the sender is
    // not bounced for a "thank you" reply.
    if (attachments.length === 0) return;

    for (const a of attachments) {
      const response = await fetch(`${env.APP_URL}/api/inbound/invoice`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-inbound-secret': env.INBOUND_EMAIL_SECRET,
        },
        body: JSON.stringify({
          to: message.to,
          from: message.from,
          subject: email.subject || '',
          attachments: [{
            filename: a.filename || 'documento',
            contentType: a.mimeType || 'application/octet-stream',
            content: toBase64(a.content),
          }],
        }),
      });
      // The app is down or busy: fail the delivery so the sending server
      // tries again later, rather than losing the invoice.
      if (response.status >= 500) {
        throw new Error(`REST Finance answered ${response.status}`);
      }
    }
  },
};

function toBase64(content) {
  const bytes = content instanceof Uint8Array ? content : new Uint8Array(content);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}
