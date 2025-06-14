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
import { encryptTokens, decryptTokens } from './utils/encryption.js';
import {
  createCalendarEvent,
  quickAddEvent,
  listCalendarEvents,
  updateCalendarEvent,
  deleteCalendarEvent,
  checkFreeBusy,
  checkSchedulingConflict,
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

// Validate required OAuth2 credentials
if (!process.env.GOOGLE_CLIENT_ID) {
  console.error('❌ CRITICAL: GOOGLE_CLIENT_ID environment variable is not set!');
  console.error('Available env vars:', Object.keys(process.env).filter(key => key.includes('GOOGLE')));
}

if (!process.env.GOOGLE_CLIENT_SECRET) {
  console.error('❌ CRITICAL: GOOGLE_CLIENT_SECRET environment variable is not set!');
}

// Initialize OAuth2 client without redirect_uri to avoid conflicts
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET
);

console.log('OAuth2 client initialized successfully');

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
          instructions: instruction + `

You have access to Google Calendar and can help users manage their events. You can create, update, delete, and query calendar events using voice commands.

CRITICAL INSTRUCTIONS FOR CALENDAR OPERATIONS:

1. TIME AND DATE HANDLING:
   - You MUST convert ALL natural language dates/times to ISO 8601 format before calling any tools
   - Always use Pacific timezone (PST/PDT) unless the user specifies otherwise
   - Current Pacific time offset: PDT is UTC-7 (March-November), PST is UTC-8 (November-March)
   
2. NATURAL LANGUAGE CONVERSIONS YOU MUST HANDLE:
   - "today" → Calculate the current date in Pacific time, use start of day (00:00:00) and end of day (23:59:59)
   - "tomorrow" → Add 1 day to current Pacific date
   - "next Tuesday" → Find the next Tuesday from current Pacific date
   - "4pm" → Today at 16:00:00 Pacific time
   - "tomorrow at 3pm" → Tomorrow at 15:00:00 Pacific time
   - "next week" → 7 days from current time
   
3. WHEN CALLING listCalendarEvents:
   - For "what's my schedule today": 
     - timeMin: "2025-06-14T00:00:00-07:00" (start of today Pacific)
     - timeMax: "2025-06-14T23:59:59-07:00" (end of today Pacific)
   - For "what's my schedule tomorrow":
     - timeMin: "2025-06-15T00:00:00-07:00" (start of tomorrow Pacific)
     - timeMax: "2025-06-15T23:59:59-07:00" (end of tomorrow Pacific)

4. MODIFYING EXISTING EVENTS - CRITICAL INSTRUCTIONS:
   
   For UPDATE requests like "change my cooking class to 2pm" or "move the meeting to tomorrow":
   a) FIRST, call listCalendarEvents to find events in the relevant time period
   b) Extract the event name from the user's request:
      - "change my cooking class to 2pm" → searchQuery: "cooking class"
      - "move the dentist appointment" → searchQuery: "dentist"
      - "reschedule the team meeting" → searchQuery: "team meeting"
   c) Call updateCalendarEvent with:
      - eventId: null (unless you have it from a previous operation)
      - searchQuery: Just the event name/title (e.g., "cooking class", NOT "change my cooking class")
      - updates: Object with the new values in ISO format
   
   For DELETE requests like "cancel my cooking class" or "remove the meeting":
   a) Extract just the event name: "cooking class" or "meeting"
   b) Call deleteCalendarEvent with:
      - eventId: null
      - searchQuery: Just the event name (e.g., "cooking class", NOT "cancel my cooking class")
      - sendNotifications: true (unless user says otherwise)

5. EXAMPLE CONVERSIONS:
   - User: "Change my cooking class to 3pm tomorrow"
     - You: First list events, then call updateCalendarEvent with:
       - searchQuery: "cooking class"
       - updates: { startDateTime: "2025-06-15T15:00:00-07:00", endDateTime: "2025-06-15T16:00:00-07:00" }
   
   - User: "Cancel the dentist appointment"
     - You: Call deleteCalendarEvent with:
       - searchQuery: "dentist"
       - sendNotifications: true
   
   - User: "Move that meeting to next Monday at 10am"
     - You: If you just listed events and there's context, use the event from context
       - searchQuery: "that meeting" (will use context)
       - updates: { startDateTime: "2025-06-16T10:00:00-07:00", endDateTime: "2025-06-16T11:00:00-07:00" }

6. SEARCH QUERY TIPS:
   - Use partial matches: "cooking" will find "Cooking Class with Chef John"
   - Be specific enough to avoid ambiguity
   - If multiple events match, ask the user to be more specific

7. CONFLICT CHECKING:
   - Always use checkSchedulingConflict before creating events to verify availability
   - If conflicts exist, inform the user and suggest alternative times

Remember: The tools expect ISO 8601 format dates ONLY. You must do all natural language processing yourself. For modifications, extract clean event names for searchQuery parameters.`,
          voice: voice,
          tools: [
            createCalendarEvent,
            quickAddEvent,
            listCalendarEvents,
            updateCalendarEvent,
            deleteCalendarEvent,
            checkFreeBusy,
            checkSchedulingConflict
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
          fastify.log.error('❌ Session error:', error);
        });

        // Log conversation events for debugging
        session.on('conversation.item.created', (item) => {
          fastify.log.info('💬 Conversation item created:', item.type);
          if (item.type === 'function_call') {
            fastify.log.info('🔧 Function call detected:', item.name, 'with arguments:', item.arguments);
          }
        });

        session.on('response.done', () => {
          fastify.log.info('✅ AI response completed, waiting for user input...');
        });

        // Enhanced tool execution logging
        session.on('response.output_item.added', (item) => {
          fastify.log.info('📤 Response output item added:', item.type);
          if (item.type === 'function_call') {
            fastify.log.info('🔧 Tool call initiated:', item.name);
          }
        });

        session.on('response.function_call_arguments.done', (item) => {
          fastify.log.info('🔧 Tool call arguments completed:', item.name, 'with args:', item.arguments);
        });

        // Log when tools are actually executed
        session.on('conversation.item.created', (item) => {
          if (item.type === 'function_call_output') {
            fastify.log.info('🔧 Tool execution result:', item.call_id, 'output:', item.output);
          }
        });

        fastify.log.info('🔊 Session setup completed successfully with enhanced logging');

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

// Debug endpoint to check environment variables
fastify.get('/debug/env', async (request, reply) => {
  const googleVars = Object.keys(process.env)
    .filter(key => key.includes('GOOGLE'))
    .reduce((obj, key) => {
      obj[key] = process.env[key] ? `Set (${process.env[key].substring(0, 10)}...)` : 'Missing';
      return obj;
    }, {});
  
  reply.send({
    googleEnvironmentVariables: googleVars,
    hasClientId: !!process.env.GOOGLE_CLIENT_ID,
    hasClientSecret: !!process.env.GOOGLE_CLIENT_SECRET,
    hasRedirectUri: !!process.env.GOOGLE_REDIRECT_URI,
    nodeEnv: process.env.NODE_ENV,
    railwayEnv: process.env.RAILWAY_ENVIRONMENT
  });
});

// Test endpoint for Google Calendar API connectivity
fastify.get('/debug/calendar-test', async (request, reply) => {
  try {
    // Import CalendarService
    const CalendarService = (await import('./services/calendarService.js')).default;
    const calendarService = new CalendarService();
    
    // Test initialization
    const initialized = await calendarService.initialize();
    if (!initialized) {
      return reply.send({
        success: false,
        error: 'Calendar service failed to initialize - no tokens found',
        hasTokenFile: await fs.pathExists(TOKEN_FILE)
      });
    }

    // Test basic API call
    try {
      const events = await calendarService.listEvents({
        timeMin: new Date().toISOString(),
        timeMax: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        maxResults: 5
      });

      reply.send({
        success: true,
        message: 'Calendar API is working correctly',
        eventCount: events.length,
        hasTokenFile: true,
        events: events.map(event => ({
          summary: event.summary,
          start: event.start?.dateTime || event.start?.date,
          id: event.id
        }))
      });
    } catch (apiError) {
      reply.send({
        success: false,
        error: 'Calendar API call failed',
        details: apiError.message,
        hasTokenFile: true,
        initialized: true
      });
    }

  } catch (error) {
    fastify.log.error('Calendar test error:', error);
    reply.status(500).send({
      success: false,
      error: 'Calendar test failed',
      details: error.message
    });
  }
});

// Test endpoint for conflict checking specifically
fastify.get('/debug/conflict-test', async (request, reply) => {
  try {
    const CalendarService = (await import('./services/calendarService.js')).default;
    const calendarService = new CalendarService();
    
    const initialized = await calendarService.initialize();
    if (!initialized) {
      return reply.send({
        success: false,
        error: 'Calendar service not initialized'
      });
    }

    // Test today 6-8pm PST conflict check
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 18, 0, 0); // 6pm
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 20, 0, 0); // 8pm

    const freeBusy = await calendarService.checkFreeBusy(
      todayStart.toISOString(),
      todayEnd.toISOString()
    );

    const calendarId = process.env.GOOGLE_CALENDAR_ID || 'primary';
    const busyTimes = freeBusy[calendarId]?.busy || [];

    reply.send({
      success: true,
      testTimeSlot: {
        start: todayStart.toISOString(),
        end: todayEnd.toISOString(),
        timeSlotDescription: '6-8pm today PST'
      },
      conflicts: busyTimes,
      hasConflicts: busyTimes.length > 0,
      isAvailable: busyTimes.length === 0,
      freeBusyResponse: freeBusy
    });

  } catch (error) {
    fastify.log.error('Conflict test error:', error);
    reply.status(500).send({
      success: false,
      error: 'Conflict test failed',
      details: error.message
    });
  }
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
