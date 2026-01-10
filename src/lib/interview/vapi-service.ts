/**
 * Vapi.ai Service for AI Voice Interviews
 * Creates and manages Vapi assistants for conducting interviews
 */

import { VapiClient } from '@vapi-ai/server-sdk';

// Initialize Vapi client
const vapi = new VapiClient({ token: process.env.VAPI_API_KEY! });

export interface CreateAssistantParams {
  candidateName: string;
  jobTitle: string;
  jobDescription?: string;
  requiredSkills: string[];
  experienceRequired?: string;
}

/**
 * Create a Vapi assistant for conducting an interview
 * @param params - Assistant configuration parameters
 * @returns Assistant ID from Vapi
 */
export async function createInterviewAssistant(
  params: CreateAssistantParams
): Promise<{ assistantId: string; error?: string }> {
  try {
    if (!process.env.VAPI_API_KEY) {
      throw new Error('VAPI_API_KEY not configured');
    }

    const { candidateName, jobTitle, jobDescription, requiredSkills, experienceRequired } = params;

    // Build interview instructions
    const instructions = buildInterviewInstructions(params);

    // Create assistant via Vapi API
    const assistant = await vapi.assistants.create({
      name: `Interview:${candidateName}`,
      model: {
        provider: 'openai',
        model: 'gpt-4',
        temperature: 0.7,
        messages: [
          {
            role: 'system',
            content: instructions,
          }
        ],
      } as any,
      voice: {
        provider: 'openai',
        voiceId: 'fable',
      } as any,
      firstMessage: `Hello ${candidateName.split(' ')[0]}, thank you for joining us today. I'm excited to learn more about your experience for the ${jobTitle} position. Are you ready to begin?`,
      transcriber: {
        provider: 'deepgram',
        model: 'nova-2',
        language: 'en',
      } as any,
      recordingEnabled: false,
      endCallPhrases: [
        'end call',
        'goodbye',
        'that\'s all',
        'thank you for your time',
      ],
      maxDurationSeconds: 2700,
    } as any);

    console.log(`Vapi assistant created: ${assistant.id}`);

    return {
      assistantId: assistant.id,
    };
  } catch (error: any) {
    console.error('Error creating Vapi assistant:', error);
    return {
      assistantId: '',
      error: error.message || 'Failed to create assistant',
    };
  }
}

/**
 * Build interview instructions for the AI assistant
 * @param params - Job and candidate information
 * @returns System prompt for Vapi assistant
 */
function buildInterviewInstructions(params: CreateAssistantParams): string {
  const { candidateName, jobTitle, jobDescription, requiredSkills, experienceRequired } = params;

  const firstName = candidateName.split(' ')[0];

  return `You are an AI interviewer conducting a professional job interview for the position of ${jobTitle}.

CANDIDATE INFORMATION:
- Name: ${candidateName}
- Position: ${jobTitle}
${experienceRequired ? `- Experience Required: ${experienceRequired}` : ''}

JOB REQUIREMENTS:
${jobDescription ? `Description: ${jobDescription}\n` : ''}
Key Skills: ${requiredSkills.join(', ')}

YOUR ROLE:
You are a professional, friendly, and thorough interviewer. Your goal is to:
1. Assess the candidate's technical skills and experience
2. Understand their problem-solving approach
3. Evaluate their communication skills
4. Gauge their fit for the role

INTERVIEW STRUCTURE (30-45 minutes):
1. Opening (2 min):
   - Welcome ${firstName} warmly
   - Brief overview of the interview process
   - Ask if they're comfortable and ready

2. Background Questions (8-10 min):
   - "Can you tell me about your current/most recent role?"
   - "What experience do you have with [key skills from requirements]?"
   - "Walk me through a typical day in your current position"

3. Technical Questions (15-20 min):
   - Ask 4-6 questions about required skills: ${requiredSkills.slice(0, 3).join(', ')}
   - Ask for specific examples: "Can you describe a time when you..."
   - Probe deeper based on their answers
   - Ask about challenges they've faced and how they overcame them

4. Problem-Solving (5-10 min):
   - Present a relevant scenario or challenge
   - Ask how they would approach solving it
   - Listen for structured thinking and creativity

5. Questions & Closing (5 min):
   - Ask if they have any questions about the role or company
   - Thank them for their time
   - Let them know next steps will be communicated via email

INTERVIEW GUIDELINES:
- Be conversational and natural, not robotic
- Listen actively and ask follow-up questions
- Allow the candidate time to think before answering
- If they struggle with a question, rephrase or provide context
- Keep the tone professional but friendly
- Avoid discriminatory questions (age, religion, marital status, etc.)
- Focus on skills, experience, and job-related qualifications
- Take mental notes of key points they mention

IMPORTANT:
- Do NOT ask personal questions unrelated to the job
- Keep answers focused and concise (aim for 2-3 minute responses per question)
- If candidate goes off-topic, gently guide them back
- End the interview after 45 minutes maximum
- Be encouraging and positive throughout

When the interview is complete, thank ${firstName} for their time and let them know they'll hear back soon about next steps.`;
}

/**
 * Get assistant details from Vapi
 * @param assistantId - Vapi assistant ID
 * @returns Assistant details
 */
export async function getAssistantDetails(assistantId: string) {
  try {
    const assistant = await vapi.assistants.get({ id: assistantId } as any);
    return assistant;
  } catch (error: any) {
    console.error('Error fetching assistant:', error);
    throw error;
  }
}

/**
 * Delete Vapi assistant
 * @param assistantId - Vapi assistant ID
 */
export async function deleteAssistant(assistantId: string): Promise<void> {
  try {
    await vapi.assistants.delete({ id: assistantId } as any);
    console.log(`Vapi assistant deleted: ${assistantId}`);
  } catch (error: any) {
    console.error('Error deleting assistant:', error);
    throw error;
  }
}

/**
 * Get call transcript from Vapi
 * @param callId - Vapi call ID
 * @returns Call details with transcript
 */
export async function getCallTranscript(callId: string) {
  try {
    const call = await vapi.calls.get({ id: callId } as any);
    return call;
  } catch (error: any) {
    console.error('Error fetching call transcript:', error);
    throw error;
  }
}
