/**
 * Vapi.ai Webhook Handler
 * Receives events from Vapi during and after interviews
 */

import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { getCallTranscript } from '../lib/interview/vapi-service';

const router = Router();

/**
 * POST /api/webhooks/vapi
 * Handle Vapi webhook events
 * Public endpoint - verified by Vapi signature
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const payload = req.body;
    const message = payload.message;

    console.log('\n========================================');
    console.log('🔔 VAPI WEBHOOK RECEIVED');
    console.log('Timestamp:', new Date().toISOString());
    console.log('Message Type:', message?.type);
    console.log('========================================\n');

    // Verify webhook signature (if configured)
    const authHeader = req.headers['authorization'];

    if (!authHeader) {
      console.log('❌ Missing Authorization header');
      return res.status(401).json({ error: 'Missing Authorization header' });
    }

    const expected = `Bearer ${process.env.VAPI_WEBHOOK_SECRET}`;

    if (authHeader !== expected) {
      console.error('❌ Invalid Vapi webhook token');
      return res.status(401).json({ error: 'Unauthorized' });
    }

    console.log('✅ Webhook authentication successful');

    if (!message || !message.type) {
      console.log('⚠️ No message or message type in payload');
      return res.status(200).json({ received: true });
    }

    // Handle different Vapi event types
    switch (message.type) {
      case 'status-update':
        console.log('📞 Handling status-update event');
        await handleStatusUpdate(payload);
        break;

      case 'end-of-call-report':
        console.log('📞 Handling end-of-call-report event');
        await handleEndOfCallReport(payload);
        break;

      case 'conversation-update':
        console.log('📞 Handling conversation-update event');
        await handleConversationUpdate(payload);
        break;

      case 'hang':
        console.log('📞 Handling hang event');
        await handleHang(payload);
        break;

      default:
        console.log(`⚠️ Unhandled Vapi event type: ${message.type}`);
    }

    // Always respond with 200 to acknowledge receipt
    console.log('✅ Webhook processed successfully, sending 200 response\n');
    res.status(200).json({ received: true });
  } catch (error: any) {
    console.error('❌ Error handling Vapi webhook:', error);
    console.error('Error stack:', error.stack);
    // Still respond with 200 to prevent retries
    res.status(200).json({ received: true, error: error.message });
  }
});

/**
 * Handle status-update event (when call status changes)
 * This event fires when call starts, ends, etc.
 */
async function handleStatusUpdate(payload: any) {
  try {
    console.log('=== STATUS UPDATE EVENT START ===');
    const message = payload.message;
    const call = payload.call || {};
    const status = message?.status;

    // Extract with fallbacks for robustness
    const callId = call?.id || message?.call?.id;
    const assistantId = call.assistantId || call.assistant?.id || message?.assistantId;

    console.log('Status:', status);
    console.log('Call ID:', callId);
    console.log('Assistant ID:', assistantId);

    if (!callId) {
      console.log('❌ Missing call ID in status-update');
      return;
    }

    if (!assistantId) {
      console.log('⚠️ Missing assistant ID in status-update');
    }

    // Find interview by assistant ID
    console.log(`🔍 Looking for interview with vapiAssistantId: ${assistantId}`);
    const interview = await prisma.interview.findFirst({
      where: { vapiAssistantId: assistantId }
    });

    if (!interview) {
      console.log(`❌ No interview found for assistantId: ${assistantId}`);
      return;
    }

    console.log(`✅ Found interview: ${interview.id}, current status: ${interview.status}`);

    // Update interview based on status
    if (status === 'in-progress' && interview.status === 'PENDING') {
      console.log(`💾 Updating interview with callId: ${callId} and status IN_PROGRESS`);
      await prisma.interview.update({
        where: { id: interview.id },
        data: {
          vapiCallId: callId,
          status: 'IN_PROGRESS',
          startedAt: interview.startedAt || new Date()
        }
      });
      console.log(`✅ Interview ${interview.id} started successfully`);
    } else {
      console.log(`ℹ️ Status update: ${status} (no action taken)`);
    }

    console.log('=== STATUS UPDATE EVENT END ===\n');
  } catch (error: any) {
    console.error('❌ Error handling status-update:', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
    });
  }
}

/**
 * Handle end-of-call-report event (when call completes)
 * Fetch transcript from Vapi API and save to database
 */
async function handleEndOfCallReport(payload: any) {
  try {
    console.log('=== END OF CALL REPORT EVENT START ===');
    console.log('Event received, will fetch transcript from Vapi API');

    const call = payload.call || {};
    const message = payload.message || {};

    // Extract with fallbacks for robustness
    const callId = call.id || message.call?.id || call.callId;
    const assistantId = call.assistantId || call.assistant?.id || message.assistant.id;
    const duration = call.durationSeconds || call.duration || message.durationSeconds || 0;
    const endedReason = call.endedReason || message.endedReason;

    console.log(`Call ID: ${callId}`);
    console.log(`Assistant ID: ${assistantId}`);
    console.log(`Duration: ${duration}s`);
    console.log(`Ended Reason: ${endedReason}`);

    if (!callId) {
      console.log('❌ Missing callId in end-of-call-report');
      return;
    }

    // Find interview by call ID
    console.log(`🔍 Looking for interview with vapiCallId: ${callId}`);
    let interview = await prisma.interview.findFirst({
      where: { vapiCallId: callId }
    });

    // Fallback: try finding by assistantId
    if (!interview && assistantId) {
      console.log(`🔍 Fallback: looking for assistantId: ${assistantId}`);
      interview = await prisma.interview.findFirst({
        where: { vapiAssistantId: assistantId }
      });

      if (interview) {
        console.log(`✅ Found interview by assistantId: ${interview.id}`);
        // Update with callId
        await prisma.interview.update({
          where: { id: interview.id },
          data: { vapiCallId: callId }
        });
      }
    }

    if (!interview) {
      console.log('❌ Could not find interview by callId or assistantId');
      return;
    }

    console.log(`✅ Found interview: ${interview.id}`);
    console.log(`📞 Fetching full transcript from Vapi API for callId: ${callId}`);

    // Wait a moment for Vapi to finalize the transcript
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Fetch transcript from Vapi API
    let transcript = '';
    let rawMessages: any = null;

    try {
      const callDetails = await getCallTranscript(callId);
      console.log('✅ Successfully fetched call details from Vapi API');
      console.log('Call details keys:', Object.keys(callDetails));

      // Check different possible locations for messages/transcript (with fallbacks)
      const messages =
        callDetails.messages ||
        (callDetails as any)?.transcript?.messages ||
        (callDetails as any)?.artifact?.messages ||
        [];

      console.log(`Found ${messages.length} messages in call details`);

      if (messages.length > 0) {
        transcript = extractTranscriptFromMessages(messages);
        rawMessages = messages;
        console.log(`📝 Transcript extracted: ${transcript.length} characters`);

        if (transcript.length > 0) {
          console.log(`📝 First 200 chars: ${transcript.substring(0, 200)}`);
        } else {
          console.log('⚠️ Transcript is empty after extraction');
        }
      } else {
        console.log('⚠️ No messages found in call details');
        console.log('Call details available keys:', Object.keys(callDetails).join(', '));
      }
    } catch (error: any) {
      console.error('❌ Error fetching transcript from Vapi:', error);
      console.error('Error details:', error.message);

      // Check if error is retriable
      const isRetriable =
        error.code === 'ECONNRESET' ||
        error.code === 'ETIMEDOUT' ||
        error.code === 'ECONNREFUSED' ||
        error.message?.toLowerCase().includes('timeout') ||
        error.message?.toLowerCase().includes('network');

      if (isRetriable) {
        console.log('⚠️ Retriable error detected - transcript fetch will be retried on next webhook');
      }
    }

    // Determine status
    const wasAbandoned =
      endedReason === 'hangup' ||
      endedReason === 'user-hangup' ||
      endedReason === 'assistant-hangup' ||
      duration < 60; // Less than 1 minute
    const status = wasAbandoned ? 'ABANDONED' : 'COMPLETED';

    console.log(`Status: ${status} (reason: ${endedReason}, duration: ${duration}s)`);

    // Update interview in database
    const updateData = {
      status,
      completedAt: status === 'COMPLETED' ? new Date() : undefined,
      abandonedAt: status === 'ABANDONED' ? new Date() : undefined,
      duration,
      transcript: transcript || null,
      rawMessages: rawMessages ? JSON.parse(JSON.stringify(rawMessages)) : null,
    };

    console.log(`💾 Updating interview ${interview.id} in database...`);
    console.log('Update data:', {
      status: updateData.status,
      hasTranscript: !!updateData.transcript,
      transcriptLength: updateData.transcript?.length || 0,
      duration: updateData.duration,
    });

    const updatedInterview = await prisma.interview.update({
      where: { id: interview.id },
      data: updateData as any
    });

    console.log('✅ Database update successful!');
    console.log('Final verification:', {
      id: updatedInterview.id,
      status: updatedInterview.status,
      hasTranscript: !!updatedInterview.transcript,
      transcriptLength: updatedInterview.transcript?.length || 0,
      hasRawMessages: !!updatedInterview.rawMessages,
      duration: updatedInterview.duration,
      completedAt: updatedInterview.completedAt,
      abandonedAt: updatedInterview.abandonedAt,
    });

    // Final validation
    if (status === 'COMPLETED' && !updatedInterview.transcript) {
      console.error('⚠️ WARNING: Interview marked COMPLETED but transcript is missing!');
      console.error('This may indicate an issue with transcript extraction or API response');
    } else if (status === 'COMPLETED' && updatedInterview.transcript) {
      console.log(`✅ TRANSCRIPT SAVED SUCCESSFULLY: ${updatedInterview.transcript.length} characters`);
    }

    console.log('=== END OF CALL REPORT EVENT END ===\n');
  } catch (error: any) {
    console.error('❌ Error handling end-of-call-report:', error);
    console.error('Stack:', error.stack);
  }
}

/**
 * Handle conversation-update event (real-time transcript updates)
 * Just acknowledge - we'll fetch full transcript at end of call
 */
async function handleConversationUpdate(payload: any) {
  try {
    console.log('=== CONVERSATION UPDATE EVENT ===');
    const message = payload.message;
    const conversation = message?.conversation || [];
    console.log(`Received conversation update with ${conversation.length} messages`);
    console.log('Will fetch full transcript when call ends');
  } catch (error: any) {
    console.error('❌ Error handling conversation-update:', error);
  }
}

/**
 * Handle hang event (when call is hung up)
 * Just acknowledge - end-of-call-report will handle final status
 */
async function handleHang(payload: any) {
  try {
    console.log('=== HANG EVENT ===');
    const call = payload.call;
    console.log(`Call ID: ${call?.id} - Call hung up`);
    console.log('Will process final status in end-of-call-report');
  } catch (error: any) {
    console.error('❌ Error handling hang:', error);
  }
}

/**
 * Extract plain text transcript from Vapi messages array
 * Handles multiple message formats and filters empty content
 */
function extractTranscriptFromMessages(messages: any[]): string {
  console.log('🔍 Extracting transcript from messages...');

  if (!messages || !Array.isArray(messages)) {
    console.log('❌ messages is not an array or is null/undefined');
    return '';
  }

  console.log(`✅ Processing ${messages.length} messages`);

  const transcript = messages
    .filter((msg: any) => {
      // Exclude system messages
      if (msg.role === 'system') return false;

      // Exclude messages without content
      const content = msg.content || msg.message || msg.text || '';
      return content.trim().length > 0;
    })
    .map((msg: any, index: number) => {
      const role = msg.role === 'assistant' ? 'AI Interviewer' : 'Candidate';

      // Try multiple content field names
      const content = msg.content || msg.message || msg.text || '';

      // Add timestamp if available
      const timestamp = msg.timestamp
        ? `[${new Date(msg.timestamp).toLocaleTimeString()}] `
        : '';

      console.log(
        `  Message ${index + 1}: role=${msg.role}, ` +
        `contentLength=${content.length}`
      );

      return `${timestamp}${role}: ${content.trim()}`;
    })
    .join('\n\n');

  console.log(`✅ Final transcript length: ${transcript.length} characters`);

  // Validate transcript has actual content
  if (transcript.trim().length === 0) {
    console.log('⚠️ Transcript is empty or only whitespace');
  }

  return transcript;
}

export default router;
