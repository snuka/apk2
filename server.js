import dotenv from 'dotenv';
dotenv.config();

import Fastify from 'fastify';
import { RealtimeAgent, RealtimeSession } from '@openai/agents/realtime';
import { TwilioRealtimeTransportLayer } from '@openai/agents-extensions';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { google } from 'googleapis';
import crypto from 'crypto';
import {
  createCalendarEvent,
  quickAddEvent,
  listCalendarEvents,
  updateCalendarEvent,
  deleteCalendarEvent,
  checkFreeBusy,
  setContextManager
} from './tools/calendarTools.js';

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

// Context Management System
class ConversationContext {
  constructor() {
    this.sessions = new Map(); // sessionId -> context data
  }

  getSession(sessionId) {
    if (!this.sessions.has(sessionId)) {
      this.sessions.set(sessionId, {
        lastCalendarQuery: null,
        lastEventsList: [],
        lastSearchQuery: null,
        pendingOperations: [],
        conversationHistory: []
      });
    }
    return this.sessions.get(sessionId);
  }

  updateLastQuery(sessionId, queryType, queryParams, results) {
    const session = this.getSession(sessionId);
    session.lastCalendarQuery = {
      type: queryType,
      params: queryParams,
      results: results,
      timestamp: new Date()
    };
    
    if (queryType === 'listCalendarEvents' && results.events) {
      session.lastEventsList = results.events;
    }
  }

  findEventByReference(sessionId, reference) {
    const session = this.getSession(sessionId);
    const events = session.lastEventsList;
    
    if (!events || events.length === 0) {
      return null;
    }

    // Clean reference for matching
    const cleanRef = reference.toLowerCase().replace(/[^a-z0-9\s]/g, '');
    
    // Try to match by summary
    let matchedEvent = events.find(event => 
      event.summary && event.summary.toLowerCase().includes(cleanRef)
    );

    if (matchedEvent) return matchedEvent;

    // Try to match by attendee names (if reference contains a name)
    const nameWords = cleanRef.split(' ').filter(word => word.length > 2);
    for (const word of nameWords) {
      matchedEvent = events.find(event => 
        event.attendees && event.attendees.toLowerCase().includes(word)
      );
      if (matchedEvent) return matchedEvent;
    }

    // If only one event, return it for ambiguous references like "that meeting"
    if (events.length === 1 && 
        ['that', 'the', 'this', 'it'].some(ref => cleanRef.includes(ref))) {
      return events[0];
    }

    return null;
  }

  addConversationItem(sessionId, type, content) {
    const session = this.getSession(sessionId);
    session.conversationHistory.push({
      type,
      content,
      timestamp: new Date()
    });
    
    // Keep only last 10 conversation items to avoid memory issues
    if (session.conversationHistory.length > 10) {
      session.conversationHistory = session.conversationHistory.slice(-10);
    }
  }

  clearSession(sessionId) {
    this.sessions.delete(sessionId);
  }
}

const conversationContext = new ConversationContext();

// Inject context manager into calendar tools
setContextManager(conversationContext);

// Google OAuth2 Setup
console.log('Loading Google OAuth2 credentials...');
console.log('Client ID:', process.env.GOOGLE_CLIENT_ID ? 'Found' : 'Missing');
console.log('Client Secret:', process.env.GOOGLE_CLIENT_SECRET ? 'Found' : 'Missing');
console.log('Redirect URI:', process.env.GOOGLE_REDIRECT_URI);

// Initialize OAuth2 client without redirect_uri to avoid conflicts
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET
);

// Helper function to get the correct redirect URI
function getRedirectUri(request) {
  // Use environment variable if set, otherwise construct from request
  if (process.env.GOOGLE_REDIRECT_URI) {
    return process.env.GOOGLE_REDIRECT_URI;
  }
  
  // Fallback: construct from request headers
  const protocol = request.headers['x-forwarded-proto'] || request.protocol || 'https';
  const host = request.headers.host;
  return `${protocol}://${host}/api/auth/google/callback`;
}

// Token storage
const TOKEN_FILE = path.join(__dirname, 'google_tokens.json');

// Encryption helpers
const algorithm = 'aes-256-gcm';
const encryptionKey = process.env.TOKEN_ENCRYPTION_KEY ? 
  crypto.scryptSync(process.env.TOKEN_ENCRYPTION_KEY, 'salt', 32) : 
  crypto.randomBytes(32);

function encryptTokens(tokens) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(algorithm, encryptionKey, iv);
  
  let encrypted = cipher.update(JSON.stringify(tokens), 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag();
  
  return {
    encrypted,
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex')
  };
}

function decryptTokens(encryptedData) {
  const decipher = crypto.createDecipheriv(
    algorithm, 
    encryptionKey, 
    Buffer.from(encryptedData.iv, 'hex')
  );
  
  decipher.setAuthTag(Buffer.from(encryptedData.authTag, 'hex'));
  
  let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return JSON.parse(decrypted);
}

async function getGoogleEmail(accessToken) {
  try {
    const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });
    const data = await response.json();
    return data.email;
  } catch (error) {
    fastify.log.error('Error fetching Google email:', error);
    return null;
  }
}

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

// 3. Google OAuth2 endpoints
fastify.get('/api/auth/google/init', async (request, reply) => {
  const { state } = request.query;
  
  // Get the correct redirect URI for this request
  const redirectUri = getRedirectUri(request);
  fastify.log.info('OAuth init - using redirect_uri:', redirectUri);
  
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: [
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/calendar.events'
    ],
    state: state || crypto.randomBytes(16).toString('hex'),
    redirect_uri: redirectUri
  });
  
  reply.redirect(authUrl);
});

fastify.get('/api/auth/google/callback', async (request, reply) => {
  const { code, state } = request.query;
  
  try {
    // Get the same redirect URI used in the init request
    const redirectUri = getRedirectUri(request);
    fastify.log.info('OAuth callback - using redirect_uri:', redirectUri);
    
    // Exchange code for tokens with explicit redirect_uri
    const { tokens } = await oauth2Client.getToken({
      code: code,
      redirect_uri: redirectUri
    });
    
    // Get user email
    const email = await getGoogleEmail(tokens.access_token);
    
    // Store tokens securely
    await fs.writeJson(TOKEN_FILE, {
      tokens: encryptTokens(tokens),
      email: email,
      lastSynced: new Date().toISOString()
    });
    
    fastify.log.info('Google OAuth tokens stored successfully');
    reply.redirect('/admin?calendar=connected');
  } catch (error) {
    fastify.log.error('OAuth callback error:', error);
    reply.redirect('/admin?calendar=error');
  }
});

fastify.get('/api/auth/google/status', async (request, reply) => {
  try {
    if (await fs.pathExists(TOKEN_FILE)) {
      const data = await fs.readJson(TOKEN_FILE);
      
      // Check if tokens are valid
      try {
        const tokens = decryptTokens(data.tokens);
        oauth2Client.setCredentials(tokens);
        
        // Test the tokens
        const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
        await calendar.calendarList.list({ maxResults: 1 });
        
        reply.send({
          isConnected: true,
          email: data.email,
          lastSynced: data.lastSynced
        });
      } catch (error) {
        fastify.log.error('Token validation error:', error);
        reply.send({ isConnected: false });
      }
    } else {
      reply.send({ isConnected: false });
    }
  } catch (error) {
    fastify.log.error('Status check error:', error);
    reply.send({ isConnected: false });
  }
});

fastify.post('/api/auth/google/disconnect', async (request, reply) => {
  try {
    await fs.remove(TOKEN_FILE);
    reply.send({ success: true });
  } catch (error) {
    fastify.log.error('Disconnect error:', error);
    reply.status(500).send({ error: 'Failed to disconnect' });
  }
});

// 4. Twilio Voice Webhook
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

// 5. WebSocket for Twilio Media Streams
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

        // Create RealtimeAgent with dynamic prompt, voice, and calendar tools
        const agent = new RealtimeAgent({
          name: 'AlwaysPickup Assistant',
          instructions: instruction + '\n\nYou have access to Google Calendar and can help users manage their events. You can create, update, delete, and query calendar events using voice commands.',
          voice: voice,
          tools: [
            createCalendarEvent,
            quickAddEvent,
            listCalendarEvents,
            updateCalendarEvent,
            deleteCalendarEvent,
            checkFreeBusy
          ]
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

// 6. Health check / keep-warm
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
