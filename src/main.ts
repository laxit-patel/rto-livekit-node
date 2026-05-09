import {
  type JobContext,
  WorkerOptions,
  cli,
  defineAgent,
  voice,
} from '@livekit/agents';
import * as openaiPlugin from '@livekit/agents-plugin-openai';
import * as sarvam from '@livekit/agents-plugin-sarvam';
import * as silero from '@livekit/agents-plugin-silero';
import { fileURLToPath } from 'node:url';
import 'dotenv/config';
import { LIVEKIT_AGENT_NAME } from './livekit/dispatch.js';
import type { ShopifyOrderContext, RTOAttempt } from './shopify/types.js';
import { rtoService } from './shopify/service.js';
import { startWebhookServer } from './webhook-server.js';

// Language code mapping
const LANGUAGE_CODES: Record<string, { stt: string; tts: string }> = {
  'hi-IN': { stt: 'hi-IN', tts: 'hi-IN' },
  'gu-IN': { stt: 'gu-IN', tts: 'gu-IN' },
  'ta-IN': { stt: 'ta-IN', tts: 'ta-IN' },
  'te-IN': { stt: 'te-IN', tts: 'te-IN' },
};

function parseJobMetadata(rawMetadata: unknown): Record<string, unknown> {
  if (!rawMetadata) {
    return {};
  }

  if (typeof rawMetadata === 'string') {
    try {
      return JSON.parse(rawMetadata) as Record<string, unknown>;
    } catch {
      return {};
    }
  }

  if (typeof rawMetadata === 'object') {
    return rawMetadata as Record<string, unknown>;
  }

  return {};
}

export default defineAgent({
  prewarm: async (proc) => {
    proc.userData.vad = await silero.VAD.load();
  },
  entry: async (ctx: JobContext) => {
    const roomName = ctx.room.name ?? 'unknown';
    console.log(`\n📞 Starting RTO agent session for room: ${roomName}`);

    // Extract Shopify order context from job metadata
    let orderContext: ShopifyOrderContext | null = null;
    try {
      const metadata = parseJobMetadata((ctx.job as any)?.metadata);
      if (metadata.orderId) {
        console.log(`📦 Fetching order context for: ${metadata.orderId}`);
        orderContext = await rtoService.getOrderContext(metadata.orderId as string);
        console.log(`✓ Order loaded: ${orderContext.customerName} (${orderContext.customerPhone})`);
      }
    } catch (error) {
      console.warn('⚠️  Could not load Shopify order context:', error);
    }

    const customerName = orderContext?.customerName || 'customer';
    const language = orderContext?.language || 'hi-IN';
    const languageCodes = LANGUAGE_CODES[language] || LANGUAGE_CODES['hi-IN'];
    const attemptNumber = orderContext?.attemptNumber || 1;

    // Personalized instructions based on order context
    const agentInstructions = orderContext
      ? `You are an RTO recovery agent calling ${customerName} regarding order ${orderContext.orderName}.
This is attempt #${attemptNumber} to reschedule delivery.
${orderContext.previousAttempts.length > 0 ? `Previous reason: ${orderContext.previousAttempts[0].reason || 'Not provided'}` : ''}
Stay friendly, brief, and professional. Record the customer's reason for failed delivery.`
      : `You are an RTO (Return to Origin) recovery assistant for Shopify delivery failures.
Speak clearly and politely. Ask for the reason of failed delivery and confirm it back briefly.`;

    // Retry connection logic
    for (let attempt = 1; attempt <= 5; attempt++) {
      try {
        console.log(`🔗 Room connection (attempt ${attempt}/5)...`);
        await ctx.connect();
        console.log(`✓ Connected to room: ${roomName}`);
        break;
      } catch (error) {
        if (attempt === 5) {
          console.error(`❌ Failed to connect after 5 attempts: ${error}`);
          throw error;
        }
        const waitTime = Math.pow(2, attempt - 1) * 1000;
        console.warn(`⏳ Retry in ${waitTime / 1000}s...`);
        await new Promise((resolve) => setTimeout(resolve, waitTime));
      }
    }

    const agent = new voice.Agent({
      instructions: agentInstructions,
    });

    const session = new voice.AgentSession({
      stt: new sarvam.STT({
        model: 'saaras:v3',
        languageCode: languageCodes.stt,
      }),
      llm: new openaiPlugin.LLM({
        model: 'openai/gpt-4o-mini',
        apiKey: process.env.OPENROUTER_API_KEY?.trim(),
        baseURL: 'https://openrouter.ai/api/v1',
      }),
      tts: new sarvam.TTS({
        model: 'bulbul:v3',
        targetLanguageCode: languageCodes.tts,
      }),
      vad: ctx.proc.userData.vad as silero.VAD,
    });

    const startTime = Date.now();
    await session.start({ agent, room: ctx.room });
    const callDurationSeconds = Math.round((Date.now() - startTime) / 1000);

    // Generate personalized greeting
    const greetingPrompt = orderContext
      ? `Greet ${customerName} by name in ${language.split('-')[0]}, reference order ${orderContext.orderName}, and politely ask why the delivery failed. Keep it very brief.`
      : `Greet the caller and ask why their delivery failed. Respond in ${language.split('-')[0]}.`;

    await session.generateReply({
      instructions: greetingPrompt,
    });

    // Record RTO attempt to Shopify (if order context available)
    if (orderContext) {
      try {
        const rtoAttempt: RTOAttempt = {
          timestamp: new Date().toISOString(),
          language,
          agentId: ctx.job?.id || 'unknown',
          callDurationSeconds,
          status: 'completed',
          // Reason would be captured from agent's conversation (MVP: hardcoded)
          reason: 'Reason recorded during call',
        };

        await rtoService.recordAttempt(orderContext.orderId, rtoAttempt);
        console.log(`✓ RTO attempt recorded in Shopify`);
      } catch (error) {
        console.error('Error recording RTO attempt:', error);
      }
    }

    console.log(`\n✓ Session completed (${callDurationSeconds}s)\n`);
  },
});

// Start webhook HTTP server (Shopify webhooks) alongside the LiveKit agent worker.
// The agent connects outbound to LiveKit Cloud — no inbound HTTP port needed for it.
startWebhookServer(Number(process.env.WEBHOOK_PORT) || 3000);

cli.runApp(new WorkerOptions({
  agent: fileURLToPath(import.meta.url),
  agentName: LIVEKIT_AGENT_NAME,
}));
