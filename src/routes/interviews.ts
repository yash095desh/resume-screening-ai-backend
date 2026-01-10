import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { generateInterviewToken, generateInterviewLink, calculateExpiryDate } from '../lib/interview/token-generator';
import { createInterviewAssistant } from '../lib/interview/vapi-service';
import { sendInterviewEmail, isValidEmail } from '../lib/interview/email-service';
import { analyzeInterview } from '../lib/interview/interview-analyzer';

const router = Router();

/**
 * POST /api/interviews
 * Create a new interview for a candidate
 */
router.post('/', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const { userId } = req;
    const {
      source, // 'SCREENING' or 'SOURCING'
      candidateId, // For SCREENING
      linkedInCandidateId, // For SOURCING
      jobId, // For SCREENING
      sourcingJobId, // For SOURCING
      emailTemplateId, // Optional: specific template to use
      customEmailSubject, // Optional: override template subject
      customEmailBody, // Optional: override template body
      linkExpiryHours, // Optional: default 48 hours
      sendEmailNow=true, // Optional: send email immediately (default: false)
    } = req.body;

    // Validation
    if (!source || (source !== 'SCREENING' && source !== 'SOURCING')) {
      return res.status(400).json({
        error: 'Invalid source. Must be SCREENING or SOURCING'
      });
    }

    // Validate candidate and job combinations
    if (source === 'SCREENING') {
      if (!candidateId || !jobId) {
        return res.status(400).json({
          error: 'candidateId and jobId required for SCREENING source'
        });
      }
    } else if (source === 'SOURCING') {
      if (!linkedInCandidateId || !sourcingJobId) {
        return res.status(400).json({
          error: 'linkedInCandidateId and sourcingJobId required for SOURCING source'
        });
      }
    }

    // Fetch candidate data
    let candidate: any;
    let job: any;
    let candidateEmail: string | null = null;

    if (source === 'SCREENING') {
      // Fetch from Candidate table
      candidate = await prisma.candidate.findFirst({
        where: { id: candidateId, job: { userId: userId! } }
      });

      if (!candidate) {
        return res.status(404).json({ error: 'Candidate not found' });
      }

      job = await prisma.job.findFirst({
        where: { id: jobId, userId: userId! }
      });

      if (!job) {
        return res.status(404).json({ error: 'Job not found' });
      }

      candidateEmail = candidate.email;
    } else {
      // Fetch from LinkedInCandidate table
      candidate = await prisma.linkedInCandidate.findFirst({
        where: { id: linkedInCandidateId, sourcingJob: { userId: userId! } }
      });

      if (!candidate) {
        return res.status(404).json({ error: 'LinkedIn candidate not found' });
      }

      job = await prisma.sourcingJob.findFirst({
        where: { id: sourcingJobId, userId: userId! }
      });

      if (!job) {
        return res.status(404).json({ error: 'Sourcing job not found' });
      }

      candidateEmail = candidate.email;
    }

    // Validate candidate has email
    if (!candidateEmail || !isValidEmail(candidateEmail)) {
      return res.status(400).json({
        error: 'Candidate does not have a valid email address'
      });
    }

    // Generate interview token and link
    const token = generateInterviewToken();
    const interviewLink = generateInterviewLink(token);
    const expiryDate = calculateExpiryDate(linkExpiryHours || 48);

    console.log(`Creating interview for candidate: ${candidateEmail}`);

    // Create Vapi assistant
    const assistantResult = await createInterviewAssistant({
      candidateName: candidate.name || candidate.fullName || 'Candidate',
      jobTitle: job.title,
      jobDescription: job.description || job.rawJobDescription,
      requiredSkills: job.requiredSkills || [],
      experienceRequired: job.experienceRequired,
    });

    if (assistantResult.error) {
      console.error('Failed to create Vapi assistant:', assistantResult.error);
      return res.status(500).json({
        error: 'Failed to create interview assistant',
        details: assistantResult.error
      });
    }

    // Create interview record
    const interview = await prisma.interview.create({
      data: {
        userId: userId!,
        source,
        candidateId: source === 'SCREENING' ? candidateId : null,
        linkedInCandidateId: source === 'SOURCING' ? linkedInCandidateId : null,
        jobId: source === 'SCREENING' ? jobId : null,
        sourcingJobId: source === 'SOURCING' ? sourcingJobId : null,
        linkToken: token,
        interviewLink,
        linkExpiresAt: expiryDate,
        vapiAssistantId: assistantResult.assistantId,
        emailTemplateId: emailTemplateId || null,
        customEmailSubject: customEmailSubject || null,
        customEmailBody: customEmailBody || null,
        status: 'PENDING',
        emailSent: false,
        remindersSent: 0,
      },
      include: {
        candidate: true,
        linkedInCandidate: true,
        job: true,
        sourcingJob: true,
        emailTemplate: true,
      }
    });

    console.log(`Interview created: ${interview.id}`);

    // Send email immediately if requested
    if (sendEmailNow) {
      try {
        // Get default template if not specified
        let template = interview.emailTemplate;
        if (!template) {
          template = await prisma.emailTemplate.findFirst({
            where: {
              userId: userId!,
              type: 'INTERVIEW_INVITATION',
              isDefault: true,
              isActive: true
            }
          });

          if (!template) {
            return res.status(400).json({
              error: 'No email template found. Please create a default template first.',
              interview
            });
          }
        }

        // Get recruiter details
        const recruiter = await prisma.user.findUnique({
          where: { id: userId! }
        });

        // Send email
        const emailResult = await sendInterviewEmail({
          to: candidateEmail,
          subject: customEmailSubject || template.subject,
          bodyHtml: customEmailBody || template.bodyHtml,
          bodyText: template.bodyText || undefined,
          interview,
          candidate,
          job,
          recruiter,
        });

        if (emailResult.success) {
          // Update interview status
          await prisma.interview.update({
            where: { id: interview.id },
            data: {
              emailSent: true,
              linkSentAt: new Date(),
              status: 'LINK_SENT'
            }
          });

          console.log(`Interview email sent successfully: ${emailResult.id}`);
        } else {
          console.error('Failed to send email:', emailResult.error);
          return res.status(500).json({
            error: 'Interview created but email failed to send',
            details: emailResult.error,
            interview
          });
        }
      } catch (emailError: any) {
        console.error('Error sending email:', emailError);
        return res.status(500).json({
          error: 'Interview created but email failed to send',
          details: emailError.message,
          interview
        });
      }
    }

    res.status(201).json({
      message: 'Interview created successfully',
      interview: {
        ...interview,
        candidate: source === 'SCREENING' ? interview.candidate : interview.linkedInCandidate,
        job: source === 'SCREENING' ? interview.job : interview.sourcingJob,
      }
    });
  } catch (error: any) {
    console.error('Error creating interview:', error);
    next(error);
  }
});

/**
 * GET /api/interviews
 * List all interviews for the authenticated user
 */
router.get('/', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const { userId } = req;
    const { status, source, jobId, sourcingJobId } = req.query;

    // Build filter
    const where: any = { userId: userId! };
    if (status) where.status = status;
    if (source) where.source = source;
    if (jobId) where.jobId = jobId;
    if (sourcingJobId) where.sourcingJobId = sourcingJobId;

    const interviews = await prisma.interview.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        candidate: {
          select: {
            id: true,
            name: true,
            email: true,
            matchScore: true,
          }
        },
        linkedInCandidate: {
          select: {
            id: true,
            fullName: true,
            email: true,
            matchScore: true,
            currentPosition: true,
            currentCompany: true,
          }
        },
        job: {
          select: {
            id: true,
            title: true,
          }
        },
        sourcingJob: {
          select: {
            id: true,
            title: true,
          }
        },
        emailTemplate: {
          select: {
            id: true,
            name: true,
            type: true,
          }
        }
      }
    });

    // Format response to combine candidate/job based on source
    const formattedInterviews = interviews.map(interview => ({
      ...interview,
      candidate: interview.source === 'SCREENING' ? interview.candidate : interview.linkedInCandidate,
      job: interview.source === 'SCREENING' ? interview.job : interview.sourcingJob,
    }));

    res.json(formattedInterviews);
  } catch (error) {
    console.error('Error fetching interviews:', error);
    next(error);
  }
});

/**
 * GET /api/interviews/:id
 * Get specific interview details
 */
router.get('/:id', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const { userId } = req;
    const { id } = req.params;

    const interview = await prisma.interview.findFirst({
      where: {
        id,
        userId: userId!
      },
      include: {
        candidate: true,
        linkedInCandidate: true,
        job: true,
        sourcingJob: true,
        emailTemplate: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          }
        }
      }
    });

    if (!interview) {
      return res.status(404).json({ error: 'Interview not found' });
    }

    // Format response
    const formattedInterview = {
      ...interview,
      candidate: interview.source === 'SCREENING' ? interview.candidate : interview.linkedInCandidate,
      job: interview.source === 'SCREENING' ? interview.job : interview.sourcingJob,
    };

    res.json(formattedInterview);
  } catch (error) {
    console.error('Error fetching interview:', error);
    next(error);
  }
});

/**
 * PATCH /api/interviews/:id
 * Update interview details
 */
router.patch('/:id', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const { userId } = req;
    const { id } = req.params;
    const { status, customEmailSubject, customEmailBody } = req.body;

    // Check interview exists and belongs to user
    const existingInterview = await prisma.interview.findFirst({
      where: { id, userId: userId! }
    });

    if (!existingInterview) {
      return res.status(404).json({ error: 'Interview not found' });
    }

    // Update interview
    const updatedInterview = await prisma.interview.update({
      where: { id },
      data: {
        ...(status && { status }),
        ...(customEmailSubject && { customEmailSubject }),
        ...(customEmailBody && { customEmailBody }),
      },
      include: {
        candidate: true,
        linkedInCandidate: true,
        job: true,
        sourcingJob: true,
      }
    });

    res.json({
      message: 'Interview updated successfully',
      interview: updatedInterview
    });
  } catch (error) {
    console.error('Error updating interview:', error);
    next(error);
  }
});

/**
 * POST /api/interviews/:id/send-email
 * Send interview invitation email
 */
router.post('/:id/send-email', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const { userId } = req;
    const { id } = req.params;
    const { emailTemplateId, customSubject, customBody } = req.body;

    // Fetch interview with all relations
    const interview = await prisma.interview.findFirst({
      where: { id, userId: userId! },
      include: {
        candidate: true,
        linkedInCandidate: true,
        job: true,
        sourcingJob: true,
        emailTemplate: true,
      }
    });

    if (!interview) {
      return res.status(404).json({ error: 'Interview not found' });
    }

    // Get candidate and job based on source
    const candidate = interview.source === 'SCREENING' ? interview.candidate : interview.linkedInCandidate;
    const job = interview.source === 'SCREENING' ? interview.job : interview.sourcingJob;

    if (!candidate || !job) {
      return res.status(400).json({ error: 'Candidate or job data missing' });
    }

    const candidateEmail = candidate.email;

    if (!candidateEmail || !isValidEmail(candidateEmail)) {
      return res.status(400).json({ error: 'Candidate does not have a valid email' });
    }

    // Get email template
    let template = interview.emailTemplate;
    if (emailTemplateId) {
      template = await prisma.emailTemplate.findFirst({
        where: {
          id: emailTemplateId,
          userId: userId!,
          isActive: true
        }
      });
    }

    if (!template && !customBody) {
      // Try to get default template
      template = await prisma.emailTemplate.findFirst({
        where: {
          userId: userId!,
          type: 'INTERVIEW_INVITATION',
          isDefault: true,
          isActive: true
        }
      });

      if (!template) {
        return res.status(400).json({
          error: 'No email template found. Please provide a template or custom email body.'
        });
      }
    }

    // Get recruiter details
    const recruiter = await prisma.user.findUnique({
      where: { id: userId! }
    });

    // Send email
    const emailResult = await sendInterviewEmail({
      to: candidateEmail,
      subject: customSubject || interview.customEmailSubject || template?.subject || 'Interview Invitation',
      bodyHtml: customBody || interview.customEmailBody || template?.bodyHtml || '',
      bodyText: template?.bodyText || undefined,
      interview,
      candidate,
      job,
      recruiter,
    });

    if (!emailResult.success) {
      return res.status(500).json({
        error: 'Failed to send email',
        details: emailResult.error
      });
    }

    // Update interview status
    const updatedInterview = await prisma.interview.update({
      where: { id },
      data: {
        emailSent: true,
        linkSentAt: new Date(),
        status: interview.status === 'PENDING' ? 'LINK_SENT' : interview.status,
        emailTemplateId: emailTemplateId || interview.emailTemplateId,
      }
    });

    res.json({
      message: 'Email sent successfully',
      emailId: emailResult.id,
      interview: updatedInterview
    });
  } catch (error: any) {
    console.error('Error sending interview email:', error);
    next(error);
  }
});

/**
 * POST /api/interviews/:id/resend
 * Resend interview invitation email
 */
router.post('/:id/resend', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const { userId } = req;
    const { id } = req.params;

    // Fetch interview
    const interview = await prisma.interview.findFirst({
      where: { id, userId: userId! },
      include: {
        candidate: true,
        linkedInCandidate: true,
        job: true,
        sourcingJob: true,
        emailTemplate: true,
      }
    });

    if (!interview) {
      return res.status(404).json({ error: 'Interview not found' });
    }

    // Check if interview is in valid state for resend
    if (interview.status === 'COMPLETED' || interview.status === 'CANCELLED') {
      return res.status(400).json({
        error: `Cannot resend email for ${interview.status.toLowerCase()} interview`
      });
    }

    // Get candidate and job
    const candidate = interview.source === 'SCREENING' ? interview.candidate : interview.linkedInCandidate;
    const job = interview.source === 'SCREENING' ? interview.job : interview.sourcingJob;

    if (!candidate || !job) {
      return res.status(400).json({ error: 'Candidate or job data missing' });
    }

    const candidateEmail = candidate.email;
    if (!candidateEmail || !isValidEmail(candidateEmail)) {
      return res.status(400).json({ error: 'Candidate does not have a valid email' });
    }

    // Get template
    let template = interview.emailTemplate;
    if (!template) {
      template = await prisma.emailTemplate.findFirst({
        where: {
          userId: userId!,
          type: 'INTERVIEW_INVITATION',
          isDefault: true,
          isActive: true
        }
      });

      if (!template) {
        return res.status(400).json({ error: 'No email template found' });
      }
    }

    // Get recruiter
    const recruiter = await prisma.user.findUnique({
      where: { id: userId! }
    });

    // Send email
    const emailResult = await sendInterviewEmail({
      to: candidateEmail,
      subject: interview.customEmailSubject || template.subject,
      bodyHtml: interview.customEmailBody || template.bodyHtml,
      bodyText: template.bodyText || undefined,
      interview,
      candidate,
      job,
      recruiter,
    });

    if (!emailResult.success) {
      return res.status(500).json({
        error: 'Failed to resend email',
        details: emailResult.error
      });
    }

    // Update interview
    await prisma.interview.update({
      where: { id },
      data: {
        emailSent: true,
        linkSentAt: new Date(),
        status: 'LINK_SENT'
      }
    });

    res.json({
      message: 'Email resent successfully',
      emailId: emailResult.id
    });
  } catch (error) {
    console.error('Error resending email:', error);
    next(error);
  }
});

/**
 * POST /api/interviews/:id/remind
 * Send reminder email for pending interview
 */
router.post('/:id/remind', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const { userId } = req;
    const { id } = req.params;
    const { urgency } = req.body; // 'gentle' or 'urgent'

    // Fetch interview
    const interview = await prisma.interview.findFirst({
      where: { id, userId: userId! },
      include: {
        candidate: true,
        linkedInCandidate: true,
        job: true,
        sourcingJob: true,
      }
    });

    if (!interview) {
      return res.status(404).json({ error: 'Interview not found' });
    }

    // Check if interview is in valid state for reminder
    if (interview.status !== 'LINK_SENT' && interview.status !== 'LINK_OPENED') {
      return res.status(400).json({
        error: 'Can only send reminders for interviews with status LINK_SENT or LINK_OPENED'
      });
    }

    // Check if link has expired
    if (new Date() > new Date(interview.linkExpiresAt)) {
      return res.status(400).json({
        error: 'Interview link has expired. Cannot send reminder.'
      });
    }

    // Get candidate and job
    const candidate = interview.source === 'SCREENING' ? interview.candidate : interview.linkedInCandidate;
    const job = interview.source === 'SCREENING' ? interview.job : interview.sourcingJob;

    if (!candidate || !job) {
      return res.status(400).json({ error: 'Candidate or job data missing' });
    }

    const candidateEmail = candidate.email;
    if (!candidateEmail || !isValidEmail(candidateEmail)) {
      return res.status(400).json({ error: 'Candidate does not have a valid email' });
    }

    // Determine template type based on urgency
    const templateType = urgency === 'urgent' ? 'REMINDER_6H' : 'REMINDER_24H';

    // Get reminder template
    const template = await prisma.emailTemplate.findFirst({
      where: {
        userId: userId!,
        type: templateType,
        isDefault: true,
        isActive: true
      }
    });

    if (!template) {
      return res.status(400).json({
        error: `No ${urgency} reminder template found. Please create one first.`
      });
    }

    // Get recruiter
    const recruiter = await prisma.user.findUnique({
      where: { id: userId! }
    });

    // Send reminder email
    const emailResult = await sendInterviewEmail({
      to: candidateEmail,
      subject: template.subject,
      bodyHtml: template.bodyHtml,
      bodyText: template.bodyText || undefined,
      interview,
      candidate,
      job,
      recruiter,
    });

    if (!emailResult.success) {
      return res.status(500).json({
        error: 'Failed to send reminder',
        details: emailResult.error
      });
    }

    // Update interview reminder count
    await prisma.interview.update({
      where: { id },
      data: {
        remindersSent: interview.remindersSent + 1,
        lastReminderAt: new Date()
      }
    });

    res.json({
      message: 'Reminder sent successfully',
      emailId: emailResult.id,
      reminderCount: interview.remindersSent + 1
    });
  } catch (error) {
    console.error('Error sending reminder:', error);
    next(error);
  }
});

/**
 * POST /api/interviews/:id/analyze
 * Analyze interview transcript with AI
 */
router.post('/:id/analyze', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const { userId } = req;
    const { id } = req.params;

    // Fetch interview with all relations
    const interview = await prisma.interview.findFirst({
      where: { id, userId: userId! },
      include: {
        candidate: true,
        linkedInCandidate: true,
        job: true,
        sourcingJob: true,
      }
    });

    if (!interview) {
      return res.status(404).json({ error: 'Interview not found' });
    }

    // Check if interview is completed
    if (interview.status !== 'COMPLETED' && interview.status !== 'ABANDONED') {
      return res.status(400).json({
        error: 'Interview must be completed before analysis'
      });
    }

    // Check if transcript exists
    if (!interview.transcript || interview.transcript.trim().length === 0) {
      return res.status(400).json({
        error: 'No transcript available for analysis'
      });
    }

    // Get candidate and job
    const candidate = interview.source === 'SCREENING' ? interview.candidate : interview.linkedInCandidate;
    const job = interview.source === 'SCREENING' ? interview.job : interview.sourcingJob;

    if (!candidate || !job) {
      return res.status(400).json({ error: 'Candidate or job data missing' });
    }

    // Analyze interview
    const analysis = await analyzeInterview({
      transcript: interview.transcript,
      candidateName: interview.source === 'SCREENING'
        ? (candidate as any).name || 'Candidate'
        : (candidate as any).fullName || 'Candidate',
      jobTitle: job.title,
      jobDescription: interview.source === 'SCREENING'
        ? (job as any).description
        : (job as any).rawJobDescription,
      requiredSkills: (job as any).requiredSkills || [],
      experienceRequired: (job as any).experienceRequired || '',
    });

    // Update interview with analysis
    const updatedInterview = await prisma.interview.update({
      where: { id },
      data: {
        overallScore: analysis.overallScore,
        technicalScore: analysis.technicalScore,
        communicationScore: analysis.communicationScore,
        cultureFitScore: analysis.cultureFitScore,
        strengths: analysis.strengths,
        concerns: analysis.concerns,
        keyInsights: analysis.keyInsights,
        recommendation: analysis.recommendation,
        detailedAnalysis: analysis.detailedAnalysis as any,
      }
    });

    res.json({
      message: 'Interview analyzed successfully',
      analysis: {
        overallScore: analysis.overallScore,
        technicalScore: analysis.technicalScore,
        communicationScore: analysis.communicationScore,
        cultureFitScore: analysis.cultureFitScore,
        strengths: analysis.strengths,
        concerns: analysis.concerns,
        keyInsights: analysis.keyInsights,
        recommendation: analysis.recommendation,
        recommendationReason: analysis.recommendationReason,
        detailedAnalysis: analysis.detailedAnalysis,
      },
      interview: updatedInterview
    });
  } catch (error: any) {
    console.error('Error analyzing interview:', error);
    next(error);
  }
});

/**
 * DELETE /api/interviews/:id
 * Cancel/delete an interview
 */
router.delete('/:id', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const { userId } = req;
    const { id } = req.params;

    // Check interview exists and belongs to user
    const interview = await prisma.interview.findFirst({
      where: { id, userId: userId! }
    });

    if (!interview) {
      return res.status(404).json({ error: 'Interview not found' });
    }

    // Update status to CANCELLED instead of deleting
    await prisma.interview.update({
      where: { id },
      data: { status: 'CANCELLED' }
    });

    res.json({ message: 'Interview cancelled successfully' });
  } catch (error) {
    console.error('Error cancelling interview:', error);
    next(error);
  }
});

export default router;
