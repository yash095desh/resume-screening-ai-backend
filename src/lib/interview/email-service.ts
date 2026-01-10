/**
 * Email Service for Interview Invitations
 * Integrates with Resend API to send email invitations
 */

import { Resend } from 'resend';
import { parseEmailTemplate, getTemplateVariables } from '../email/template-parser';

// Initialize Resend client
const resend = new Resend(process.env.RESEND_API_KEY);

export interface SendInterviewEmailParams {
  to: string;
  subject: string;
  bodyHtml: string;
  bodyText?: string;
  interview: any;
  candidate: any;
  job: any;
  recruiter: any;
}

/**
 * Send interview invitation email
 * @param params - Email parameters
 * @returns Resend API response with email ID
 */
export async function sendInterviewEmail(
  params: SendInterviewEmailParams
): Promise<{ id: string; success: boolean; error?: string }> {
  try {
    const { to, subject, bodyHtml, bodyText, interview, candidate, job, recruiter } = params;

    // Validate email configuration
    if (!process.env.RESEND_API_KEY) {
      throw new Error('RESEND_API_KEY not configured');
    }

    if (!process.env.FROM_EMAIL) {
      throw new Error('FROM_EMAIL not configured');
    }

    // Get template variables
    const variables = getTemplateVariables(interview, candidate, job, recruiter);

    // Parse templates with variables
    const parsedSubject = parseEmailTemplate(subject, variables);
    const parsedBodyHtml = parseEmailTemplate(bodyHtml, variables);
    const parsedBodyText = bodyText ? parseEmailTemplate(bodyText, variables) : undefined;

    console.log(`Sending interview email to ${to} for interview ${interview.id}`);

    // Send email via Resend
    const response = await resend.emails.send({
      from: process.env.FROM_EMAIL,
      to,
      subject: parsedSubject,
      html: parsedBodyHtml,
      text: parsedBodyText,
    });

    if (response.error) {
      console.error('Resend API error:', response.error);
      return {
        id: '',
        success: false,
        error: response.error.message || 'Failed to send email'
      };
    }

    console.log(`Email sent successfully. Resend ID: ${response.data?.id}`);

    return {
      id: response.data?.id || '',
      success: true
    };
  } catch (error: any) {
    console.error('Error sending interview email:', error);
    return {
      id: '',
      success: false,
      error: error.message || 'Unknown error sending email'
    };
  }
}

/**
 * Send reminder email for pending interview
 * @param params - Email parameters (similar to invitation)
 * @returns Resend API response
 */
export async function sendReminderEmail(
  params: SendInterviewEmailParams
): Promise<{ id: string; success: boolean; error?: string }> {
  // Reuse the same email sending logic
  return sendInterviewEmail(params);
}

/**
 * Validate email address format
 * @param email - Email address to validate
 * @returns True if valid, false otherwise
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Get email provider name from email address
 * @param email - Email address
 * @returns Provider name (e.g., "gmail", "outlook")
 */
export function getEmailProvider(email: string): string {
  const domain = email.split('@')[1]?.toLowerCase();
  if (!domain) return 'unknown';

  if (domain.includes('gmail')) return 'gmail';
  if (domain.includes('outlook') || domain.includes('hotmail')) return 'outlook';
  if (domain.includes('yahoo')) return 'yahoo';
  if (domain.includes('icloud')) return 'icloud';

  return domain;
}
