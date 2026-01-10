/**
 * Template Parser Utility
 * Replaces template variables with actual values
 */

import { generateInterviewLinkButton } from './templates';

/**
 * Parse email template by replacing variables with actual values
 * @param template - Template string with {{variable}} placeholders
 * @param variables - Object with variable values
 * @returns Parsed template string
 */
export function parseEmailTemplate(
  template: string,
  variables: Record<string, any>
): string {
  let parsed = template;

  // Replace each variable
  for (const [key, value] of Object.entries(variables)) {
    // Escape special regex characters in the key
    const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escapedKey, 'g');

    // Replace with value (convert to string, handle null/undefined)
    parsed = parsed.replace(regex, value != null ? String(value) : '');
  }

  return parsed;
}

/**
 * Get template variables for an interview
 * @param interview - Interview object
 * @param candidate - Candidate object (from Screening or Sourcing)
 * @param job - Job object
 * @param recruiter - User (recruiter) object
 * @returns Object with all template variables
 */
export function getTemplateVariables(
  interview: any,
  candidate: any,
  job: any,
  recruiter: any
): Record<string, string> {
  // Get candidate name (different field names for Screening vs Sourcing)
  const candidateName = candidate.name || candidate.fullName || 'Candidate';
  const firstName = candidateName.split(' ')[0] || candidateName;

  // Calculate hours until expiry
  const now = new Date();
  const expiresAt = new Date(interview.linkExpiresAt);
  const hoursRemaining = Math.max(
    0,
    Math.round((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60))
  );

  // Format expiry time
  const expiryTime = expiresAt.toLocaleString('en-US', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short'
  });

  return {
    // Candidate variables
    '{{candidate_name}}': candidateName,
    '{{candidate_first_name}}': firstName,
    '{{candidate_email}}': candidate.email || '',

    // Job variables
    '{{job_title}}': job.title || 'Position',
    '{{job_description}}': job.description || '',
    '{{company_name}}': 'Our Company', // TODO: Add company name to Job model

    // Interview variables
    '{{interview_link}}': generateInterviewLinkButton(interview.interviewLink),
    '{{interview_duration}}': '30-45 minutes',
    '{{expiry_time}}': expiryTime,
    '{{expiry_hours}}': String(Math.max(1, Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60)))),
    '{{hours_remaining}}': String(hoursRemaining),

    // Recruiter variables
    '{{recruiter_name}}': recruiter.name || 'The Hiring Team',
    '{{recruiter_email}}': recruiter.email || '',
    '{{recruiter_phone}}': '', // TODO: Add phone to User model if needed
  };
}

/**
 * Get template variables for preview (with sample data)
 * @returns Object with sample template variables
 */
export function getSampleTemplateVariables(): Record<string, string> {
  const sampleInterview = {
    interviewLink: 'https://example.com/interview/sample123',
    linkExpiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000) // 48 hours from now
  };

  const sampleCandidate = {
    name: 'John Doe',
    email: 'john.doe@example.com'
  };

  const sampleJob = {
    title: 'Senior Frontend Engineer',
    description: 'Build amazing user experiences'
  };

  const sampleRecruiter = {
    name: 'Jane Smith',
    email: 'jane@company.com'
  };

  return getTemplateVariables(
    sampleInterview,
    sampleCandidate,
    sampleJob,
    sampleRecruiter
  );
}

/**
 * Validate template syntax
 * @param template - Template string
 * @returns Object with validation result
 */
export function validateTemplate(template: string): {
  valid: boolean;
  errors: string[];
  variables: string[];
} {
  const errors: string[] = [];
  const variables: string[] = [];

  // Extract all variables from template
  const variableRegex = /\{\{([^}]+)\}\}/g;
  let match;

  while ((match = variableRegex.exec(template)) !== null) {
    const variable = `{{${match[1]}}}`;
    if (!variables.includes(variable)) {
      variables.push(variable);
    }
  }

  // Check for unclosed brackets
  const openBrackets = (template.match(/\{\{/g) || []).length;
  const closeBrackets = (template.match(/\}\}/g) || []).length;

  if (openBrackets !== closeBrackets) {
    errors.push('Unclosed variable brackets detected');
  }

  // Check for nested variables
  if (/\{\{[^}]*\{\{/.test(template)) {
    errors.push('Nested variables are not supported');
  }

  return {
    valid: errors.length === 0,
    errors,
    variables
  };
}

/**
 * Strip HTML tags from template (for plain text version)
 * @param html - HTML template
 * @returns Plain text version
 */
export function stripHtmlTags(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/h[1-6]>/gi, '\n\n')
    .replace(/<li>/gi, '- ')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
