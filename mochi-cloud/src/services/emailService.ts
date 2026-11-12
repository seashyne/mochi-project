import { MochiEnv } from '../types/env';

// Options for sending transactional emails across supported cloud providers
export interface SendEmailOptions {
  toEmail: string;
  toName?: string;
  subject: string;
  htmlContent: string;
  textContent: string;
}

// Result of transactional email dispatch
export interface EmailSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

// Strips CR/LF characters from email header fields to prevent header injection
function sanitizeHeaderValue(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').trim();
}

// Encodes non-ASCII email headers using RFC 2047 UTF-8 Base64 encoding
function encodeUtf8Header(value: string): string {
  const clean = sanitizeHeaderValue(value);
  if (!/[^\x20-\x7E]/.test(clean)) {
    return clean;
  }
  const bytes = new TextEncoder().encode(clean);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return `=?UTF-8?B?${btoa(binary)}?=`;
}

// Normalizes body text to strict CRLF line endings required by RFC 5322 MIME
function toCrlf(content: string): string {
  return content.replace(/\r?\n/g, '\r\n');
}

// Builds a clean-room RFC 5322 multipart/alternative MIME email payload
export function buildMimeEmailMessage(
  fromEmail: string,
  fromName: string,
  options: SendEmailOptions,
  messageId: string
): string {
  const safeFromEmail = sanitizeHeaderValue(fromEmail);
  const safeFromName = encodeUtf8Header(fromName).replace(/"/g, '');
  const safeToEmail = sanitizeHeaderValue(options.toEmail);
  const safeToHeader = options.toName
    ? `"${encodeUtf8Header(options.toName).replace(/"/g, '')}" <${safeToEmail}>`
    : `<${safeToEmail}>`;
  const boundary = `mochi-mime-${crypto.randomUUID().replace(/-/g, '')}`;

  const lines = [
    `From: "${safeFromName}" <${safeFromEmail}>`,
    `To: ${safeToHeader}`,
    `Subject: ${encodeUtf8Header(options.subject)}`,
    `Message-ID: <${sanitizeHeaderValue(messageId)}>`,
    `Date: ${new Date().toUTCString()}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: 8bit',
    '',
    toCrlf(options.textContent),
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: 8bit',
    '',
    toCrlf(options.htmlContent),
    `--${boundary}--`,
    ''
  ];

  return lines.join('\r\n');
}

// Builds HTML and plain text email content for 6-digit OTP verification
export function buildOtpEmailTemplate(code: string, username?: string): {
  subject: string;
  htmlContent: string;
  textContent: string;
} {
  const displayName = username || 'Player';
  const subject = `Your Mochi Verification Code: ${code}`;

  const textContent = [
    `Hello ${displayName},`,
    '',
    `Your Mochi email verification code is: ${code}`,
    '',
    'This code will expire in 15 minutes.',
    'If you did not request this verification code, please ignore this email.',
    '',
    'Best regards,',
    'The Mochi Platform Team'
  ].join('\n');

  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${subject}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      background-color: #0b0e14;
      color: #e2e8f0;
      margin: 0;
      padding: 32px 16px;
    }
    .container {
      max-width: 520px;
      margin: 0 auto;
      background: #111520;
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 12px;
      padding: 32px;
    }
    .header { font-size: 20px; font-weight: 700; letter-spacing: -0.02em; color: #ffffff; margin-bottom: 16px; }
    .code-box {
      background: #171d2c;
      border: 1px solid rgba(56, 189, 248, 0.3);
      border-radius: 8px;
      padding: 20px;
      text-align: center;
      margin: 24px 0;
    }
    .code { font-family: monospace; font-size: 32px; font-weight: 800; letter-spacing: 0.25em; color: #38bdf8; }
    .notice { font-size: 13px; color: #94a3b8; line-height: 1.6; }
    .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid rgba(255, 255, 255, 0.06); font-size: 12px; color: #64748b; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">Verify Your Mochi Account</div>
    <p class="notice">Hello ${displayName},</p>
    <p class="notice">Welcome to Mochi. Please use the verification code below to complete your account registration:</p>
    <div class="code-box"><div class="code">${code}</div></div>
    <p class="notice">This code will expire in 15 minutes. For your security, never share this code with anyone.</p>
    <div class="footer">Mochi Platform - 100% Cloud-First Creative Gaming Studio</div>
  </div>
</body>
</html>`.trim();

  return { subject, htmlContent, textContent };
}

// Dispatches transactional email via Cloudflare Email Routing, Resend fallback, and MailChannels
export async function sendTransactionalEmail(
  env: MochiEnv,
  options: SendEmailOptions
): Promise<EmailSendResult> {
  // Test/offline environments bypass external network dispatch unless explicitly set to production
  const isTest =
    env.ENVIRONMENT === 'test' ||
    (env.ENVIRONMENT !== 'production' &&
      typeof process !== 'undefined' &&
      (process.env.NODE_ENV === 'test' || !!process.env.VITEST));
  if (isTest || !env.API_HOSTNAME?.includes('lenout.com')) {
    return {
      success: true,
      messageId: `test-mock-id-${Date.now()}`
    };
  }

  const fromEmail = env.EMAIL_FROM || 'noreply@lenout.com';
  const fromName = env.EMAIL_FROM_NAME || 'Mochi Platform';

  // Primary provider: Cloudflare Workers native Email Routing binding
  if (env.EMAIL) {
    try {
      const domain = fromEmail.split('@')[1] || 'lenout.com';
      const messageId = `${crypto.randomUUID()}@${domain}`;
      const mime = buildMimeEmailMessage(fromEmail, fromName, options, messageId);
      const { EmailMessage } = await import('cloudflare:email');
      await env.EMAIL.send(new EmailMessage(fromEmail, options.toEmail, mime));
      return { success: true, messageId };
    } catch {
      // Fall through gracefully to HTTP providers when native binding throws
    }
  }

  // Secondary fallback: Resend HTTP transactional API when configured
  if (env.RESEND_API_KEY) {
    try {
      const resendRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.RESEND_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: `${fromName} <${fromEmail}>`,
          to: [options.toEmail],
          subject: options.subject,
          html: options.htmlContent,
          text: options.textContent
        })
      });
      if (resendRes.status >= 200 && resendRes.status < 300) {
        const resendData = (await resendRes.json().catch(() => ({}))) as { id?: string };
        return {
          success: true,
          messageId: resendData.id || `resend-${Date.now()}`
        };
      }
    } catch {
      // Fall through to MailChannels relay if Resend network call fails
    }
  }

  // Tertiary fallback: MailChannels transactional relay
  const personalization: Record<string, unknown> = {
    to: [{ email: options.toEmail, name: options.toName || 'Mochi Player' }]
  };
  if (env.DKIM_DOMAIN) personalization.dkim_domain = env.DKIM_DOMAIN;
  if (env.DKIM_SELECTOR) personalization.dkim_selector = env.DKIM_SELECTOR;
  if (env.DKIM_PRIVATE_KEY) personalization.dkim_private_key = env.DKIM_PRIVATE_KEY;

  const payload = {
    personalizations: [personalization],
    from: { email: fromEmail, name: fromName },
    subject: options.subject,
    content: [
      { type: 'text/html', value: options.htmlContent },
      { type: 'text/plain', value: options.textContent }
    ]
  };

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (env.MAILCHANNELS_API_KEY) {
    headers['X-Api-Key'] = env.MAILCHANNELS_API_KEY;
  }

  try {
    const response = await fetch('https://api.mailchannels.net/tx/v1/send', {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });

    if (response.status >= 200 && response.status < 300) {
      return {
        success: true,
        messageId: response.headers.get('x-message-id') || `mc-${Date.now()}`
      };
    }

    const errorText = await response.text().catch(() => 'Unknown MailChannels error');
    return {
      success: false,
      error: `MailChannels responded with status ${response.status}: ${errorText}`
    };
  } catch (err) {
    return {
      success: false,
      error: `Failed to dispatch email: ${(err as Error).message}`
    };
  }
}
