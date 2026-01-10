/**
 * Default Email Templates for Interview Feature
 * These templates use simple HTML (no rich text editor needed)
 * Variables are replaced using {{variable_name}} syntax
 */

export const DEFAULT_TEMPLATES = {
  INTERVIEW_INVITATION: {
    name: 'Default Interview Invitation',
    subject: 'Interview Invitation for {{job_title}}',
    bodyHtml: `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
  <h2 style="color: #2563eb; margin-bottom: 16px;">Hi {{candidate_first_name}},</h2>

  <p style="margin-bottom: 16px; line-height: 1.6;">
    Thank you for your interest in the <strong>{{job_title}}</strong> position at {{company_name}}.
  </p>

  <p style="margin-bottom: 16px; line-height: 1.6;">
    We'd like to invite you to complete an AI-powered voice interview. This will help us understand your experience and qualifications better. The interview typically takes {{interview_duration}}.
  </p>

  <div style="text-align: center; margin: 32px 0;">
    {{interview_link}}
  </div>

  <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 12px 16px; margin: 24px 0; border-radius: 4px;">
    <p style="margin: 0; color: #92400e;">
      <strong>⏰ Important:</strong> This link will expire in {{expiry_hours}} hours ({{expiry_time}}).
    </p>
  </div>

  <h3 style="color: #1f2937; margin-top: 24px; margin-bottom: 12px; font-size: 16px;">What to expect:</h3>
  <ul style="line-height: 1.8; color: #4b5563;">
    <li>AI-powered conversational interview</li>
    <li>6-8 questions about your experience and skills</li>
    <li>Approximately {{interview_duration}}</li>
    <li>You can take it at your convenience before the deadline</li>
  </ul>

  <p style="margin-top: 24px; margin-bottom: 16px; line-height: 1.6;">
    If you have any questions, feel free to reach out to {{recruiter_email}}.
  </p>

  <p style="margin-top: 32px; color: #6b7280;">
    Best regards,<br>
    <strong>{{recruiter_name}}</strong>
  </p>

  <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 32px 0;">

  <p style="font-size: 12px; color: #9ca3af; text-align: center;">
    This is an automated interview invitation. Please do not reply to this email.
  </p>
</div>
    `.trim(),
    bodyText: `Hi {{candidate_first_name}},

Thank you for your interest in the {{job_title}} position at {{company_name}}.

We'd like to invite you to complete an AI-powered voice interview ({{interview_duration}}).

Interview Link: {{interview_link}}

⏰ Important: This link expires in {{expiry_hours}} hours ({{expiry_time}}).

What to expect:
- AI-powered conversational interview
- 6-8 questions about your experience and skills
- Approximately {{interview_duration}}
- You can take it at your convenience before the deadline

If you have any questions, feel free to reach out to {{recruiter_email}}.

Best regards,
{{recruiter_name}}

---
This is an automated interview invitation. Please do not reply to this email.`
  },

  REMINDER_24H: {
    name: '24-Hour Gentle Reminder',
    subject: 'Reminder: Interview Invitation for {{job_title}}',
    bodyHtml: `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
  <h2 style="color: #2563eb; margin-bottom: 16px;">Hi {{candidate_first_name}},</h2>

  <p style="margin-bottom: 16px; line-height: 1.6;">
    This is a friendly reminder about your pending interview for the <strong>{{job_title}}</strong> position.
  </p>

  <p style="margin-bottom: 16px; line-height: 1.6;">
    We sent you an interview invitation yesterday, and wanted to make sure you received it.
  </p>

  <div style="text-align: center; margin: 32px 0;">
    {{interview_link}}
  </div>

  <div style="background: #dbeafe; border-left: 4px solid #3b82f6; padding: 12px 16px; margin: 24px 0; border-radius: 4px;">
    <p style="margin: 0; color: #1e40af;">
      <strong>⏰ Time remaining:</strong> {{hours_remaining}} hours until the link expires.
    </p>
  </div>

  <p style="margin-bottom: 16px; line-height: 1.6;">
    The interview takes approximately {{interview_duration}} and can be completed at your convenience.
  </p>

  <p style="margin-top: 24px; margin-bottom: 16px; line-height: 1.6;">
    Looking forward to hearing from you!
  </p>

  <p style="margin-top: 32px; color: #6b7280;">
    Best regards,<br>
    <strong>{{recruiter_name}}</strong>
  </p>
</div>
    `.trim(),
    bodyText: `Hi {{candidate_first_name}},

This is a friendly reminder about your pending interview for the {{job_title}} position.

We sent you an interview invitation yesterday, and wanted to make sure you received it.

Interview Link: {{interview_link}}

⏰ Time remaining: {{hours_remaining}} hours until the link expires.

The interview takes approximately {{interview_duration}} and can be completed at your convenience.

Looking forward to hearing from you!

Best regards,
{{recruiter_name}}`
  },

  REMINDER_6H: {
    name: 'Urgent 6-Hour Reminder',
    subject: '⚠️ Urgent: Interview Link Expiring Soon - {{job_title}}',
    bodyHtml: `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
  <h2 style="color: #dc2626; margin-bottom: 16px;">Hi {{candidate_first_name}},</h2>

  <div style="background: #fee2e2; border-left: 4px solid #dc2626; padding: 16px; margin: 24px 0; border-radius: 4px;">
    <p style="margin: 0; color: #991b1b; font-size: 16px;">
      <strong>⚠️ Your interview link will expire in {{hours_remaining}} hours!</strong>
    </p>
  </div>

  <p style="margin-bottom: 16px; line-height: 1.6;">
    We noticed you haven't completed your interview for the <strong>{{job_title}}</strong> position yet.
  </p>

  <p style="margin-bottom: 16px; line-height: 1.6;">
    This is your final reminder. The interview takes approximately {{interview_duration}}.
  </p>

  <div style="text-align: center; margin: 32px 0;">
    {{interview_link}}
  </div>

  <p style="margin-bottom: 16px; line-height: 1.6; color: #dc2626; font-weight: 600;">
    Please complete it before {{expiry_time}} to be considered for this role.
  </p>

  <p style="margin-top: 32px; color: #6b7280;">
    Best regards,<br>
    <strong>{{recruiter_name}}</strong>
  </p>
</div>
    `.trim(),
    bodyText: `Hi {{candidate_first_name}},

⚠️ URGENT: Your interview link will expire in {{hours_remaining}} hours!

We noticed you haven't completed your interview for the {{job_title}} position yet.

This is your final reminder. The interview takes approximately {{interview_duration}}.

Interview Link: {{interview_link}}

Please complete it before {{expiry_time}} to be considered for this role.

Best regards,
{{recruiter_name}}`
  }
};

/**
 * Available template variables with descriptions
 */
export const TEMPLATE_VARIABLES = {
  INTERVIEW_INVITATION: {
    '{{candidate_name}}': 'Candidate full name',
    '{{candidate_first_name}}': 'Candidate first name',
    '{{candidate_email}}': 'Candidate email',
    '{{job_title}}': 'Job position title',
    '{{company_name}}': 'Company name',
    '{{interview_link}}': 'Unique interview link (rendered as button)',
    '{{interview_duration}}': 'Estimated duration (e.g., "30-45 minutes")',
    '{{expiry_time}}': 'Link expiration date and time',
    '{{expiry_hours}}': 'Hours until expiry',
    '{{recruiter_name}}': 'Recruiter name',
    '{{recruiter_email}}': 'Recruiter email'
  },
  REMINDER_24H: {
    '{{candidate_name}}': 'Candidate full name',
    '{{candidate_first_name}}': 'Candidate first name',
    '{{job_title}}': 'Job position title',
    '{{interview_link}}': 'Unique interview link (rendered as button)',
    '{{interview_duration}}': 'Estimated duration',
    '{{hours_remaining}}': 'Hours until link expires',
    '{{recruiter_name}}': 'Recruiter name'
  },
  REMINDER_6H: {
    '{{candidate_name}}': 'Candidate full name',
    '{{candidate_first_name}}': 'Candidate first name',
    '{{job_title}}': 'Job position title',
    '{{interview_link}}': 'Unique interview link (rendered as button)',
    '{{interview_duration}}': 'Estimated duration',
    '{{hours_remaining}}': 'Hours until link expires',
    '{{expiry_time}}': 'Exact expiration time',
    '{{recruiter_name}}': 'Recruiter name'
  },
  FOLLOW_UP: {
    '{{candidate_name}}': 'Candidate full name',
    '{{candidate_first_name}}': 'Candidate first name',
    '{{job_title}}': 'Job position title',
    '{{recruiter_name}}': 'Recruiter name',
    '{{recruiter_email}}': 'Recruiter email'
  }
};

/**
 * Generate interview link button HTML
 */
export function generateInterviewLinkButton(link: string): string {
  return `
<table role="presentation" style="margin: 0 auto;">
  <tr>
    <td style="background: #2563eb; border-radius: 6px; text-align: center;">
      <a href="${link}"
         style="display: inline-block; padding: 14px 32px; color: #ffffff; text-decoration: none; font-weight: 600; font-size: 16px;"
         target="_blank">
        Start Interview →
      </a>
    </td>
  </tr>
</table>
  `.trim();
}
