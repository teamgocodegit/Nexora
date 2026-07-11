export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text?: string;
  attachment?: {
    filename: string;
    content: Buffer;
  };
}

export interface SendEmailResult {
  success: boolean;
  providerMessageId?: string;
  error?: string;
}

export interface EmailProvider {
  send(input: SendEmailInput): Promise<SendEmailResult>;
}
