import { google } from 'googleapis';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Token storage
const TOKEN_FILE = path.join(__dirname, '../google_tokens.json');

// Encryption helpers
const algorithm = 'aes-256-gcm';
const encryptionKey = process.env.TOKEN_ENCRYPTION_KEY ? 
  crypto.scryptSync(process.env.TOKEN_ENCRYPTION_KEY, 'salt', 32) : 
  crypto.randomBytes(32);

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

class CalendarService {
  constructor() {
    this.oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );
    this.calendar = null;
  }

  async initialize() {
    try {
      if (await fs.pathExists(TOKEN_FILE)) {
        const data = await fs.readJson(TOKEN_FILE);
        const tokens = decryptTokens(data.tokens);
        this.oauth2Client.setCredentials(tokens);
        this.calendar = google.calendar({ version: 'v3', auth: this.oauth2Client });
        return true;
      }
      return false;
    } catch (error) {
      console.error('Failed to initialize calendar service:', error);
      return false;
    }
  }

  async refreshTokenIfNeeded() {
    try {
      const tokens = this.oauth2Client.credentials;
      if (tokens.expiry_date && tokens.expiry_date <= Date.now()) {
        const { credentials } = await this.oauth2Client.refreshAccessToken();
        this.oauth2Client.setCredentials(credentials);
        
        // Update stored tokens
        const data = await fs.readJson(TOKEN_FILE);
        data.tokens = encryptTokens(credentials);
        await fs.writeJson(TOKEN_FILE, data);
      }
    } catch (error) {
      console.error('Failed to refresh token:', error);
      throw error;
    }
  }

  async createEvent(params) {
    await this.refreshTokenIfNeeded();
    
    const event = {
      summary: params.summary,
      location: params.location,
      description: params.description,
      start: params.start,
      end: params.end,
      attendees: params.attendees,
      reminders: params.reminders || {
        useDefault: false,
        overrides: [
          { method: 'popup', minutes: 10 }
        ]
      }
    };

    if (params.recurrence) {
      event.recurrence = params.recurrence;
    }

    const response = await this.calendar.events.insert({
      calendarId: process.env.GOOGLE_CALENDAR_ID || 'primary',
      resource: event
    });

    return response.data;
  }

  async listEvents(params) {
    await this.refreshTokenIfNeeded();

    const response = await this.calendar.events.list({
      calendarId: process.env.GOOGLE_CALENDAR_ID || 'primary',
      timeMin: params.timeMin,
      timeMax: params.timeMax,
      maxResults: params.maxResults || 10,
      singleEvents: true,
      orderBy: 'startTime',
      q: params.searchQuery
    });

    return response.data.items || [];
  }

  async updateEvent(eventId, updates) {
    await this.refreshTokenIfNeeded();

    const response = await this.calendar.events.patch({
      calendarId: process.env.GOOGLE_CALENDAR_ID || 'primary',
      eventId: eventId,
      resource: updates
    });

    return response.data;
  }

  async deleteEvent(eventId, sendNotifications = true) {
    await this.refreshTokenIfNeeded();

    await this.calendar.events.delete({
      calendarId: process.env.GOOGLE_CALENDAR_ID || 'primary',
      eventId: eventId,
      sendNotifications: sendNotifications
    });

    return { success: true };
  }

  async checkFreeBusy(timeMin, timeMax) {
    await this.refreshTokenIfNeeded();

    const response = await this.calendar.freebusy.query({
      resource: {
        timeMin: timeMin,
        timeMax: timeMax,
        items: [{ id: process.env.GOOGLE_CALENDAR_ID || 'primary' }]
      }
    });

    return response.data.calendars;
  }

  async quickAdd(text) {
    await this.refreshTokenIfNeeded();

    const response = await this.calendar.events.quickAdd({
      calendarId: process.env.GOOGLE_CALENDAR_ID || 'primary',
      text: text
    });

    return response.data;
  }

  async findEventByTitle(title) {
    const events = await this.listEvents({
      searchQuery: title,
      timeMin: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(), // Past week
      timeMax: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // Next 30 days
      maxResults: 50
    });

    return events.find(event => 
      event.summary && event.summary.toLowerCase().includes(title.toLowerCase())
    );
  }
}

// Helper to encrypt tokens (for symmetry with decrypt)
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

export default CalendarService;
