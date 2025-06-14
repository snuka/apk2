import Fastify from 'fastify';
import { RealtimeAgent, RealtimeSession } from '@openai/agents/realtime';
import { TwilioRealtimeTransportLayer } from '@openai/agents-extensions';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const fastify = Fastify({ 
  logger: true,
  trustProxy: true 
});

// Register plugins
await fastify.register(import('@fastify/static'), {
  root: path.join(__dirname, 'public'),
  prefix: '/'
});

await fastify.register(import('@fastify/websocket'));
await fastify.register(import('@fastify/cors'));

// Register form body parser for Twilio webhooks
await fastify.register(import('@fastify/formbody'));

// Prompt storage helpers
const PROMPTS_FILE = path.join(__dirname, 'prompts.json');

async function getPrompt() {
  try {
    const data = await fs.readJson(PROMPTS_FILE);
    return data.instruction || 'You are a helpful assistant. Please respond naturally and be concise.';
  } catch (error) {
    return 'You are a helpful assistant. Please respond naturally and be concise.';
  }
}

async function getVoice() {
  try {
    const data = await fs.readJson(PROMPTS_FILE);
    return data.voice || 'alloy';
  } catch (error) {
    return 'alloy';
  }
}

async function savePrompt(instruction, voice = 'alloy') {
  await fs.writeJson(PROMPTS_FILE, { 
    instruction, 
    voice,
    updatedAt: new Date().toISOString() 
  });
}

// Routes

// 1. Admin Interface (serve static files)
fastify.get('/admin', async (request, reply) => {
  return reply.sendFile('admin/index.html');
});

// 2. Prompt Management API
fastify.put('/api/prompt', async (request, reply) => {
  try {
    const { instruction, voice } = request.body;
    
    if (!instruction || typeof instruction !== 'string') {
      return reply.status(400).send({ error: 'Instruction is required and must be a string' });
    }

    // Validate voice if provided
    const validVoices = ['alloy', 'ash', 'ballad', 'coral', 'echo', 'sage', 'shimmer', 'verse'];
    if (voice && !validVoices.includes(voice)) {
      return reply.status(400).send({ 
        error: 'Invalid voice selected', 
        validVoices 
      });
    }

    await savePrompt(instruction, voice || 'alloy');
    
    reply.send({ 
      success: true, 
      message: 'Settings updated successfully',
      instruction,
      voice: voice || 'alloy'
    });
  } catch (error) {
    fastify.log.error('Error saving settings:', error);
    reply.status(500).send({ error: 'Failed to save settings' });
  }
});

fastify.get('/api/prompt', async (request, reply) => {
  try {
    const instruction = await getPrompt();
    const voice = await getVoice();
    reply.send({ instruction, voice });
  } catch (error) {
    fastify.log.error('Error loading settings:', error);
    reply.status(500).send({ error: 'Failed to load settings' });
  }
});

// 3. Twilio Voice Webhook
fastify.post('/voice', async (request, reply) => {
  try {
    fastify.log.info('Incoming Twilio webhook:', request.body);

    // Get Railway deployment URL
    const host = request.headers.host;
    const protocol = request.headers['x-forwarded-proto'] || 'https';
    const wsUrl = `wss://${host}/media`;

    const twimlResponse = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Connect>
        <Stream url="${wsUrl}" />
    </Connect>
</Response>`;

    reply.type('application/xml');
    return reply.send(twimlResponse);
  } catch (error) {
    fastify.log.error('Voice webhook error:', error);
    reply.status(500).send({ error: 'Internal server error' });
  }
});

// 4. WebSocket for Twilio Media Streams
fastify.register(async function (fastify) {
  fastify.get('/media', { websocket: true }, (connection, req) => {
    fastify.log.info('WebSocket connection established for voice stream');

    let session = null;
    let twilioTransport = null;

    const setupSession = async () => {
      try {
        fastify.log.info('🔧 Setting up WebSocket session...');
        
        // Fetch current prompt and voice from local storage
        const instruction = await getPrompt();
        const voice = await getVoice();
        fastify.log.info('📝 Using instruction:', instruction);
        fastify.log.info('🎤 Using voice:', voice);

        // Create RealtimeAgent with dynamic prompt and voice
        const agent = new RealtimeAgent({
          name: 'AlwaysPickup Assistant',
          instructions: instruction,
          voice: voice,
        });
        fastify.log.info('🤖 RealtimeAgent created with voice:', voice);

        // Initialize Twilio transport layer with WebSocket connection (CORRECT WAY)
        const twilioTransportLayer = new TwilioRealtimeTransportLayer({
          twilioWebSocket: connection.socket,
        });
        fastify.log.info('📞 TwilioRealtimeTransportLayer initialized with WebSocket');

        // Create session with Twilio transport
        session = new RealtimeSession(agent, {
          transport: twilioTransportLayer,
        });
        fastify.log.info('🔗 RealtimeSession created');

        // Connect session to OpenAI
        fastify.log.info('🔌 Attempting to connect to OpenAI...');
        await session.connect({
          apiKey: process.env.OPENAI_API_KEY,
        });
        fastify.log.info('✅ RealtimeSession connected to OpenAI successfully!');

        // Handle session events
        session.on('error', (error) => {
          fastify.log.error('Session error:', error);
        });

        // Log conversation events for debugging
        session.on('conversation.item.created', (item) => {
          fastify.log.info('Conversation item created:', item.type);
        });

        session.on('response.done', () => {
          fastify.log.info('AI response completed, waiting for user input...');
        });

        fastify.log.info('🔊 Session setup completed successfully');

      } catch (error) {
        fastify.log.error('Error setting up voice stream:', error);
        connection.socket.close();
      }
    };

    setupSession();

    // Handle WebSocket events
    connection.socket.on('close', () => {
      fastify.log.info('WebSocket connection closed');
      if (session && typeof session.close === 'function') {
        session.close();
      }
    });

    connection.socket.on('error', (error) => {
      fastify.log.error('WebSocket error:', error);
    });
  });
});

// 5. Health check / keep-warm
fastify.get('/ping', async (request, reply) => {
  reply.send({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    service: 'alwayspickup-railway' 
  });
});

// Start server
const start = async () => {
  try {
    const PORT = process.env.PORT || 3000;
    await fastify.listen({ port: PORT, host: '0.0.0.0' });
    fastify.log.info(`� AlwaysPickup-Lite server listening on port ${PORT}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
