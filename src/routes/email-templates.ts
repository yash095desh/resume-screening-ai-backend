import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { validateTemplate } from '../lib/email/template-parser';
import { DEFAULT_TEMPLATES } from '../lib/email/templates';

const router = Router();

/**
 * GET /api/email-templates
 * List all templates for the authenticated user
 */
router.get('/', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const { userId } = req;
    const { type, isActive } = req.query;

    // Build filter
    const where: any = { userId: userId! };
    if (type) where.type = type;
    if (isActive !== undefined) where.isActive = isActive === 'true';

    const templates = await prisma.emailTemplate.findMany({
      where,
      orderBy: [
        { isDefault: 'desc' }, // Default templates first
        { createdAt: 'desc' }
      ],
      select: {
        id: true,
        name: true,
        type: true,
        subject: true,
        isDefault: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: { interviews: true }
        }
      }
    });

    res.json(templates);
  } catch (error) {
    console.error('Error fetching email templates:', error);
    next(error);
  }
});

/**
 * GET /api/email-templates/:id
 * Get a specific template by ID
 */
router.get('/:id', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const { userId } = req;
    const { id } = req.params;

    const template = await prisma.emailTemplate.findFirst({
      where: {
        id,
        userId: userId!
      }
    });

    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    res.json(template);
  } catch (error) {
    console.error('Error fetching template:', error);
    next(error);
  }
});

/**
 * POST /api/email-templates
 * Create a new email template
 */
router.post('/', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const { userId } = req;
    const { name, type, subject, bodyHtml, bodyText, variables, isDefault, isActive } = req.body;

    // Validation
    if (!name || !type || !subject || !bodyHtml) {
      return res.status(400).json({
        error: 'Missing required fields: name, type, subject, bodyHtml'
      });
    }

    // Validate HTML template syntax
    const validation = validateTemplate(bodyHtml);
    if (!validation.valid) {
      return res.status(400).json({
        error: 'Invalid template syntax',
        details: validation.errors
      });
    }

    // If setting as default, unset other defaults of the same type
    if (isDefault) {
      await prisma.emailTemplate.updateMany({
        where: {
          userId: userId!,
          type,
          isDefault: true
        },
        data: { isDefault: false }
      });
    }

    // Create template
    const template = await prisma.emailTemplate.create({
      data: {
        userId: userId!,
        name,
        type,
        subject,
        bodyHtml,
        bodyText: bodyText || '',
        variables: variables || {},
        isDefault: isDefault || false,
        isActive: isActive !== undefined ? isActive : true
      }
    });

    res.status(201).json(template);
  } catch (error: any) {
    console.error('Error creating template:', error);
    if (error.code === 'P2002') {
      return res.status(400).json({ error: 'A template with this name already exists' });
    }
    next(error);
  }
});

/**
 * PATCH /api/email-templates/:id
 * Update an existing email template
 */
router.patch('/:id', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const { userId } = req;
    const { id } = req.params;
    const { name, subject, bodyHtml, bodyText, variables, isDefault, isActive } = req.body;

    // Check template exists and belongs to user
    const existingTemplate = await prisma.emailTemplate.findFirst({
      where: { id, userId: userId! }
    });

    if (!existingTemplate) {
      return res.status(404).json({ error: 'Template not found' });
    }

    // Validate HTML template if provided
    if (bodyHtml) {
      const validation = validateTemplate(bodyHtml);
      if (!validation.valid) {
        return res.status(400).json({
          error: 'Invalid template syntax',
          details: validation.errors
        });
      }
    }

    // If setting as default, unset other defaults of the same type
    if (isDefault) {
      await prisma.emailTemplate.updateMany({
        where: {
          userId: userId!,
          type: existingTemplate.type,
          isDefault: true,
          id: { not: id }
        },
        data: { isDefault: false }
      });
    }

    // Update template
    const updatedTemplate = await prisma.emailTemplate.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(subject && { subject }),
        ...(bodyHtml && { bodyHtml }),
        ...(bodyText !== undefined && { bodyText }),
        ...(variables && { variables }),
        ...(isDefault !== undefined && { isDefault }),
        ...(isActive !== undefined && { isActive })
      }
    });

    res.json(updatedTemplate);
  } catch (error) {
    console.error('Error updating template:', error);
    next(error);
  }
});

/**
 * DELETE /api/email-templates/:id
 * Soft delete a template (mark as inactive)
 * Physical deletion is not allowed if template is used in interviews
 */
router.delete('/:id', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const { userId } = req;
    const { id } = req.params;
    const { hardDelete } = req.query;

    // Check template exists and belongs to user
    const template = await prisma.emailTemplate.findFirst({
      where: { id, userId: userId! },
      include: {
        _count: {
          select: { interviews: true }
        }
      }
    });

    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    // Check if template is used in interviews
    if (template._count.interviews > 0 && hardDelete === 'true') {
      return res.status(400).json({
        error: 'Cannot delete template that is used in interviews',
        usedInInterviews: template._count.interviews
      });
    }

    // Soft delete (default) - just mark as inactive
    if (hardDelete !== 'true') {
      const updated = await prisma.emailTemplate.update({
        where: { id },
        data: { isActive: false }
      });
      return res.json({
        message: 'Template marked as inactive',
        template: updated
      });
    }

    // Hard delete (only if not used)
    await prisma.emailTemplate.delete({
      where: { id }
    });

    res.json({ message: 'Template deleted successfully' });
  } catch (error) {
    console.error('Error deleting template:', error);
    next(error);
  }
});

/**
 * POST /api/email-templates/seed-defaults
 * Seed default templates for the authenticated user
 * Only creates templates if user doesn't have any
 */
router.post('/seed-defaults', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const { userId } = req;

    // Check if user already has templates
    const existingCount = await prisma.emailTemplate.count({
      where: { userId: userId! }
    });

    if (existingCount > 0) {
      return res.status(400).json({
        error: 'User already has templates. Use force=true to add defaults anyway.'
      });
    }

    // Create default templates
    const templates = await Promise.all([
      prisma.emailTemplate.create({
        data: {
          userId: userId!,
          name: DEFAULT_TEMPLATES.INTERVIEW_INVITATION.name,
          type: 'INTERVIEW_INVITATION',
          subject: DEFAULT_TEMPLATES.INTERVIEW_INVITATION.subject,
          bodyHtml: DEFAULT_TEMPLATES.INTERVIEW_INVITATION.bodyHtml,
          bodyText: DEFAULT_TEMPLATES.INTERVIEW_INVITATION.bodyText,
          variables: {},
          isDefault: true,
          isActive: true
        }
      }),
      prisma.emailTemplate.create({
        data: {
          userId: userId!,
          name: DEFAULT_TEMPLATES.REMINDER_24H.name,
          type: 'REMINDER_24H',
          subject: DEFAULT_TEMPLATES.REMINDER_24H.subject,
          bodyHtml: DEFAULT_TEMPLATES.REMINDER_24H.bodyHtml,
          bodyText: DEFAULT_TEMPLATES.REMINDER_24H.bodyText,
          variables: {},
          isDefault: true,
          isActive: true
        }
      }),
      prisma.emailTemplate.create({
        data: {
          userId: userId!,
          name: DEFAULT_TEMPLATES.REMINDER_6H.name,
          type: 'REMINDER_6H',
          subject: DEFAULT_TEMPLATES.REMINDER_6H.subject,
          bodyHtml: DEFAULT_TEMPLATES.REMINDER_6H.bodyHtml,
          bodyText: DEFAULT_TEMPLATES.REMINDER_6H.bodyText,
          variables: {},
          isDefault: true,
          isActive: true
        }
      })
    ]);

    res.status(201).json({
      message: `Created ${templates.length} default templates`,
      templates
    });
  } catch (error) {
    console.error('Error seeding default templates:', error);
    next(error);
  }
});

export default router;
