import { google } from 'googleapis';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { encryptTokens, decryptTokens } from '../utils/encryption.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Token storage
const TOKEN_FILE = path.join(__dirname, '../google_tokens.json');

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
    console.log('📍 CalendarService.listEvents called with:', params);
    
    try {
      // Ensure we're initialized
      if (!this.calendar) {
        console.log('❌ Calendar not initialized, attempting to initialize...');
        const initialized = await this.initialize();
        if (!initialized) {
          throw new Error('Failed to initialize calendar service');
        }
      }
      
      await this.refreshTokenIfNeeded();
      
      // Double-check calendar is available after refresh
      if (!this.calendar) {
        throw new Error('Calendar API client is not available after initialization');
      }

      console.log('📍 Calling Google Calendar API...');
      const response = await this.calendar.events.list({
        calendarId: process.env.GOOGLE_CALENDAR_ID || 'primary',
        timeMin: params.timeMin,
        timeMax: params.timeMax,
        maxResults: params.maxResults || 10,
        singleEvents: true,
        orderBy: 'startTime',
        q: params.searchQuery
      });

      console.log('📍 Google Calendar API response received, items count:', response.data.items?.length || 0);
      return response.data.items || [];
    } catch (error) {
      console.error('❌ CalendarService.listEvents error:', error);
      console.error('❌ Error details:', {
        message: error.message,
        code: error.code,
        errors: error.errors
      });
      throw error;
    }
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
    console.log('📅 Checking free/busy from', timeMin, 'to', timeMax);
    await this.refreshTokenIfNeeded();

    try {
      const calendarId = process.env.GOOGLE_CALENDAR_ID || 'primary';
      console.log('📅 Using calendar ID:', calendarId);
      
      const response = await this.calendar.freebusy.query({
        resource: {
          timeMin: timeMin,
          timeMax: timeMax,
          items: [{ id: calendarId }]
        }
      });

      console.log('📅 Free/busy response:', JSON.stringify(response.data, null, 2));
      return response.data.calendars;
    } catch (error) {
      console.error('📅 Free/busy query error:', error);
      throw error;
    }
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
      timeMin: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), // Past 30 days
      timeMax: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(), // Next 90 days
      maxResults: 100
    });

    // Clean the search title for better matching
    const cleanTitle = title.toLowerCase().trim();
    
    // Try exact match first
    let matchedEvent = events.find(event => 
      event.summary && event.summary.toLowerCase() === cleanTitle
    );
    
    // If no exact match, try contains
    if (!matchedEvent) {
      matchedEvent = events.find(event => 
        event.summary && event.summary.toLowerCase().includes(cleanTitle)
      );
    }
    
    // If still no match, try partial word matching
    if (!matchedEvent) {
      const searchWords = cleanTitle.split(/\s+/).filter(word => word.length > 2);
      matchedEvent = events.find(event => {
        if (!event.summary) return false;
        const eventTitle = event.summary.toLowerCase();
        return searchWords.some(word => eventTitle.includes(word));
      });
    }
    
    return matchedEvent;
  }
}

export default CalendarService;
