import nodemailer, { type Transporter } from 'nodemailer';

/**
 * Sending email: password reset links and the weekly report.
 *
 * Plain SMTP, so any provider works (Brevo, Amazon SES, Postmark, a Google
 * Workspace mailbox...) with four settings and no provider-specific code.
 * Until SMTP_HOST is set nothing is sent and callers fall back to what they
 * did before (the reset link is logged for an administrator).
 */

let transporter: Transporter | null = null;

export function isMailConfigured(): boolean {
  return !!(process.env.SMTP_HOST && process.env.SMTP_FROM);
}

function transport(): Transporter {
  if (!transporter) {
    const port = Number(process.env.SMTP_PORT || 587);
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      // 465 is TLS from the first byte; 587 upgrades with STARTTLS.
      secure: port === 465,
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    });
  }
  return transporter;
}

/** Sends one message. Returns false, never throws, when it could not. */
export async function sendMail(message: { to: string; subject: string; text: string; html?: string }): Promise<boolean> {
  if (!isMailConfigured()) return false;
  try {
    await transport().sendMail({ from: process.env.SMTP_FROM, ...message });
    return true;
  } catch (error) {
    console.error('[mailer] could not send', message.subject, error);
    return false;
  }
}

/** Escapes text for an HTML email body. */
export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
