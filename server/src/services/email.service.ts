import fs from 'fs';

const FROM_ADDRESS = process.env.SMTP_FROM || 'Nexora <noreply@nexora.dev>';

export interface EmailResult {
  success: boolean;
  skipped?: boolean;
  error?: string;
}

export async function sendCertificateEmail(
  to: string,
  participantName: string,
  pdfPath: string,
  certificateId: string,
  certificateType: string,
): Promise<EmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn(
      '[email] RESEND_API_KEY not set — skipping email to %s (dev mode)',
      to,
    );
    return { success: true, skipped: true };
  }

  const { Resend } = await import('resend');
  const resend = new Resend(apiKey);

  try {
    const pdfBuffer = fs.readFileSync(pdfPath);
    const typeLabel = certificateType
      .toLowerCase()
      .replace(/_/g, ' ');

    await resend.emails.send({
      from: FROM_ADDRESS,
      to,
      subject: `Your ${typeLabel} certificate`,
      html: `<p>Dear ${participantName},</p>
<p>Please find your ${typeLabel} certificate attached.</p>
<p>Certificate ID: <code>${certificateId}</code></p>
<p>You can verify this certificate by scanning the QR code on the PDF.</p>`,
      attachments: [
        { filename: `${certificateId}.pdf`, content: pdfBuffer },
      ],
    });

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}
