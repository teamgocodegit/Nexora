import type { EmailProvider, SendEmailInput, SendEmailResult } from './provider';

const FROM_ADDRESS = process.env.SMTP_FROM || 'Nexora <noreply@nexora.dev>';

export function createResendProvider(): EmailProvider {
  const apiKey = process.env.RESEND_API_KEY;

  return {
    async send(input: SendEmailInput): Promise<SendEmailResult> {
      if (!apiKey) {
        return { success: true, error: undefined, providerMessageId: 'skipped-dev-mode' };
      }

      try {
        const { Resend } = await import('resend');
        const resend = new Resend(apiKey);

        const payload: Record<string, unknown> = {
          from: FROM_ADDRESS,
          to: input.to,
          subject: input.subject,
          html: input.html,
        };

        if (input.text) payload.text = input.text;

        if (input.attachment) {
          payload.attachments = [
            {
              filename: input.attachment.filename,
              content: input.attachment.content,
            },
          ];
        }

        const result = await resend.emails.send(payload as any);

        if (result.error) {
          return { success: false, error: result.error.message };
        }

        return {
          success: true,
          providerMessageId: result.data?.id,
        };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    },
  };
}
