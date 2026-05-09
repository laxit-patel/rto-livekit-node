import {
  type JobContext,
  WorkerOptions,
  cli,
  defineAgent,
  voice,
} from '@livekit/agents';
import * as google from '@livekit/agents-plugin-google';
import * as sarvam from '@livekit/agents-plugin-sarvam';
import * as silero from '@livekit/agents-plugin-silero';
import { fileURLToPath } from 'node:url';
import 'dotenv/config';

export default defineAgent({
  prewarm: async (proc) => {
    proc.userData.vad = await silero.VAD.load();
  },
  entry: async (ctx: JobContext) => {
    const roomName = ctx.room.name ?? 'unknown';
    console.log(`Starting agent session for room: ${roomName}`);

    // Retry connection logic (mirrors Python implementation)
    for (let attempt = 1; attempt <= 5; attempt++) {
      try {
        console.log(`Attempting to connect to room (attempt ${attempt}/5)...`);
        await ctx.connect();
        console.log(`Successfully connected to room: ${roomName}`);
        break;
      } catch (error) {
        if (attempt === 5) {
          console.error(`Failed to connect after 5 attempts: ${error}`);
          throw error;
        }
        const waitTime = Math.pow(2, attempt - 1) * 1000;
        console.warn(`Connection attempt ${attempt} failed: ${error}. Retrying in ${waitTime / 1000}s...`);
        await new Promise((resolve) => setTimeout(resolve, waitTime));
      }
    }

    const agent = new voice.Agent({
      instructions: `
        You are an RTO (Return to Origin) recovery assistant for Shopify delivery failures.
        Speak clearly and politely in the customer's language.
        Supported languages: Hindi, Gujarati, Tamil, Telugu.
        Ask for one short reason for failed delivery, confirm it back briefly, and keep responses concise.
      `,
    });

    const session = new voice.AgentSession({
      stt: new sarvam.STT({
        model: 'saaras:v3',
        languageCode: 'hi-IN',
      }),
      llm: new google.LLM({
        model: 'gemini-1.5-flash',
      }),
      tts: new sarvam.TTS({
        model: 'bulbul:v3',
        targetLanguageCode: 'hi-IN',
      }),
      vad: ctx.proc.userData.vad as silero.VAD,
    });

    await session.start({ agent, room: ctx.room });
    
    // Initial greeting
    await session.generateReply({
      instructions: 'Greet the user in Hindi and ask why the delivery failed. If they respond in Gujarati, Tamil, or Telugu, switch to that language.',
    });
  },
});

cli.runApp(new WorkerOptions({ agent: fileURLToPath(import.meta.url) }));
