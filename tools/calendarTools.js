import { tool } from '@openai/agents';
import { z } from 'zod';
import CalendarService from '../services/calendarService.js';
import { 
  parseDateTime, 
  parseRecurrence, 
  formatDateForVoice, 
  toGoogleCalendarDate,
  parseDuration,
  extractEmails
} from '../utils/dateTimeParser.js';

// Initialize calendar service
const calendarService = new CalendarService();

// Reference to context manager (will be injected by server)
let contextManager = null;

export function setContextManager(manager) {
  contextManager = manager;
}

// Helper to get session ID from context (simplified for now)
function getSessionId() {
  // For now, use a default session. In a full implementation,
  // this would be extracted from the conversation context
  return 'default_session';
}

// Helper to resolve event references using context
function resolveEventReference(searchQuery) {
  if (!contextManager || !searchQuery) return null;
  
  const sessionId = getSessionId();
  
  // Check if this looks like a reference to a previous query result
  const referenceWords = ['that', 'the', 'this', 'it', 'my'];
  const lowerQuery = searchQuery.toLowerCase();
  
  if (referenceWords.some(word => lowerQuery.includes(word))) {
    return contextManager.findEventByReference(sessionId, searchQuery);
  }
  
  return null;
}

/**
 * Create a new calendar event
 */
export const createCalendarEvent = tool({
  name: 'createCalendarEvent',
  description: 'Create a new event in the user\'s Google Calendar with specified details',
  parameters: z.object({
    summary: z.string().describe('The title or summary of the event'),
    startDateTime: z.string().describe('Start date/time (natural language or ISO format)'),
    endDateTime: z.string().optional().describe('End date/time (optional, defaults to 1 hour after start)'),
    allDay: z.boolean().optional().describe('Whether this is an all-day event'),
    description: z.string().optional().describe('Event description or notes'),
    location: z.string().optional().describe('Physical or virtual location'),
    attendees: z.string().optional().describe('Comma-separated list of email addresses'),
    recurrence: z.string().optional().describe('Recurrence pattern (e.g., "every weekday", "weekly")'),
    reminders: z.array(z.object({
      method: z.enum(['popup', 'email']),
      minutes: z.number()
    })).optional().describe('Reminder settings')
  }),
  async execute(params) {
    console.log('🔧 createCalendarEvent called with:', JSON.stringify(params, null, 2));
    try {
      // Ensure calendar is initialized
      const initialized = await calendarService.initialize();
      if (!initialized) {
        return {
          error: 'Google Calendar is not connected. Please ask the user to connect their calendar through the admin interface.'
        };
      }

      // Parse start date/time
      const startParsed = parseDateTime(params.startDateTime);
      if (!startParsed) {
        return {
          error: `I couldn't understand the date "${params.startDateTime}". Please try again with a clearer date format.`
        };
      }

      // Parse end date/time or calculate based on duration
      let endDate;
      if (params.endDateTime) {
        const endParsed = parseDateTime(params.endDateTime);
        endDate = endParsed ? endParsed.start : new Date(startParsed.start.getTime() + 60 * 60 * 1000);
      } else {
        // Default to 1 hour duration
        endDate = new Date(startParsed.start.getTime() + 60 * 60 * 1000);
      }

      // Prepare event data
      const eventData = {
        summary: params.summary,
        start: toGoogleCalendarDate(startParsed.start, params.allDay || startParsed.allDay),
        end: toGoogleCalendarDate(endDate, params.allDay || startParsed.allDay),
        description: params.description,
        location: params.location
      };

      // Add attendees if provided
      if (params.attendees) {
        eventData.attendees = extractEmails(params.attendees);
      }

      // Add recurrence if provided
      if (params.recurrence) {
        const recurrenceRules = parseRecurrence(params.recurrence);
        if (recurrenceRules.length > 0) {
          eventData.recurrence = recurrenceRules;
        }
      }

      // Add reminders if provided
      if (params.reminders) {
        eventData.reminders = {
          useDefault: false,
          overrides: params.reminders
        };
      }

      // Create the event
      const event = await calendarService.createEvent(eventData);

      return {
        success: true,
        message: `I've created "${params.summary}" on ${formatDateForVoice(startParsed.start)}`,
        eventId: event.id,
        link: event.htmlLink
      };

    } catch (error) {
      console.error('Error creating calendar event:', error);
      return {
        error: 'I encountered an error while creating the event. Please try again.'
      };
    }
  }
};

/**
 * Quick add event using natural language
 */
export const quickAddEvent = tool({
  name: 'quickAddEvent',
  description: 'Create a calendar event using natural language like "Dinner with John tomorrow at 7pm"',
  parameters: z.object({
    text: z.string().describe('Natural language description of the event')
  }),
  async execute(params) {
    console.log('🔧 quickAddEvent called with:', JSON.stringify(params, null, 2));
    try {
      const initialized = await calendarService.initialize();
      if (!initialized) {
        return {
          error: 'Google Calendar is not connected. Please ask the user to connect their calendar through the admin interface.'
        };
      }

      const event = await calendarService.quickAdd(params.text);

      return {
        success: true,
        message: `I've added "${event.summary}" to your calendar`,
        eventId: event.id,
        link: event.htmlLink
      };

    } catch (error) {
      console.error('Error quick adding event:', error);
      return {
        error: 'I couldn\'t create the event. Please try rephrasing your request.'
      };
    }
  }
};

/**
 * List calendar events
 */
export const listCalendarEvents = tool({
  name: 'listCalendarEvents',
  description: 'Query and list calendar events within a specified time range',
  parameters: z.object({
    timeMin: z.string().optional().describe('Start of time range (natural language or ISO)'),
    timeMax: z.string().optional().describe('End of time range (natural language or ISO)'),
    searchQuery: z.string().optional().describe('Text to search for in events'),
    maxResults: z.number().default(10).describe('Maximum number of results to return')
  }),
  async execute(params) {
    console.log('🔧 listCalendarEvents called with:', JSON.stringify(params, null, 2));
    try {
      const initialized = await calendarService.initialize();
      if (!initialized) {
        return {
          error: 'Google Calendar is not connected. Please ask the user to connect their calendar through the admin interface.'
        };
      }

      // Parse time range
      let timeMin = new Date();
      let timeMax = new Date();
      timeMax.setDate(timeMax.getDate() + 7); // Default to next 7 days

      if (params.timeMin) {
        const parsed = parseDateTime(params.timeMin);
        if (parsed) timeMin = parsed.start;
      }

      if (params.timeMax) {
        const parsed = parseDateTime(params.timeMax);
        if (parsed) timeMax = parsed.start;
      }

      const events = await calendarService.listEvents({
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
        searchQuery: params.searchQuery,
        maxResults: params.maxResults
      });

      if (events.length === 0) {
        return {
          success: true,
          message: 'You have no events scheduled for that time period.',
          events: []
        };
      }

      // Format events for voice response
      const formattedEvents = events.map(event => ({
        summary: event.summary,
        start: formatDateForVoice(new Date(event.start.dateTime || event.start.date)),
        location: event.location,
        attendees: event.attendees?.map(a => a.email).join(', ')
      }));

      const eventDescriptions = formattedEvents.map(e => 
        `${e.summary} on ${e.start}${e.location ? ` at ${e.location}` : ''}`
      ).join(', ');

      const result = {
        success: true,
        message: `You have ${events.length} event${events.length > 1 ? 's' : ''}: ${eventDescriptions}`,
        events: formattedEvents
      };

      // Update context with query results
      if (contextManager) {
        contextManager.updateLastQuery(getSessionId(), 'listCalendarEvents', params, result);
      }

      return result;

    } catch (error) {
      console.error('Error listing events:', error);
      return {
        error: 'I encountered an error while checking your calendar. Please try again.'
      };
    }
  }
};

/**
 * Update an existing calendar event
 */
export const updateCalendarEvent = tool({
  name: 'updateCalendarEvent',
  description: 'Update an existing calendar event by ID or by searching for it',
  parameters: z.object({
    eventId: z.string().optional().describe('The ID of the event to update'),
    searchQuery: z.string().optional().describe('Search for event by title if ID not provided'),
    updates: z.object({
      summary: z.string().optional().describe('New event title'),
      startDateTime: z.string().optional().describe('New start time'),
      endDateTime: z.string().optional().describe('New end time'),
      location: z.string().optional().describe('New location'),
      description: z.string().optional().describe('New description')
    }).describe('Fields to update')
  }),
  async execute(params) {
    console.log('🔧 updateCalendarEvent called with:', JSON.stringify(params, null, 2));
    try {
      const initialized = await calendarService.initialize();
      if (!initialized) {
        return {
          error: 'Google Calendar is not connected. Please ask the user to connect their calendar through the admin interface.'
        };
      }

      // Find event by ID or search
      let eventId = params.eventId;
      if (!eventId && params.searchQuery) {
        // First try to resolve using context
        const contextEvent = resolveEventReference(params.searchQuery);
        if (contextEvent) {
          eventId = contextEvent.eventId || contextEvent.id;
        } else {
          // Fall back to searching calendar
          const event = await calendarService.findEventByTitle(params.searchQuery);
          if (!event) {
            return {
              error: `I couldn't find an event matching "${params.searchQuery}"`
            };
          }
          eventId = event.id;
        }
      }

      if (!eventId) {
        return {
          error: 'Please specify either an event ID or a search query to find the event.'
        };
      }

      // Prepare updates
      const updateData = {};
      
      if (params.updates.summary) {
        updateData.summary = params.updates.summary;
      }
      
      if (params.updates.startDateTime) {
        const parsed = parseDateTime(params.updates.startDateTime);
        if (parsed) {
          updateData.start = toGoogleCalendarDate(parsed.start, parsed.allDay);
        }
      }
      
      if (params.updates.endDateTime) {
        const parsed = parseDateTime(params.updates.endDateTime);
        if (parsed) {
          updateData.end = toGoogleCalendarDate(parsed.start, parsed.allDay);
        }
      }
      
      if (params.updates.location) {
        updateData.location = params.updates.location;
      }
      
      if (params.updates.description) {
        updateData.description = params.updates.description;
      }

      const updatedEvent = await calendarService.updateEvent(eventId, updateData);

      return {
        success: true,
        message: `I've updated the event "${updatedEvent.summary}"`,
        eventId: updatedEvent.id
      };

    } catch (error) {
      console.error('Error updating event:', error);
      return {
        error: 'I encountered an error while updating the event. Please try again.'
      };
    }
  }
};

/**
 * Delete a calendar event
 */
export const deleteCalendarEvent = tool({
  name: 'deleteCalendarEvent',
  description: 'Delete a calendar event by ID or by searching for it',
  parameters: z.object({
    eventId: z.string().optional().describe('The ID of the event to delete'),
    searchQuery: z.string().optional().describe('Search for event by title if ID not provided'),
    sendNotifications: z.boolean().default(true).describe('Whether to notify attendees')
  }),
  async execute(params) {
    console.log('🔧 deleteCalendarEvent called with:', JSON.stringify(params, null, 2));
    try {
      const initialized = await calendarService.initialize();
      if (!initialized) {
        return {
          error: 'Google Calendar is not connected. Please ask the user to connect their calendar through the admin interface.'
        };
      }

      // Find event by ID or search
      let eventId = params.eventId;
      let eventTitle = '';
      
      if (!eventId && params.searchQuery) {
        // First try to resolve using context
        const contextEvent = resolveEventReference(params.searchQuery);
        if (contextEvent) {
          eventId = contextEvent.eventId || contextEvent.id;
          eventTitle = contextEvent.summary;
        } else {
          // Fall back to searching calendar
          const event = await calendarService.findEventByTitle(params.searchQuery);
          if (!event) {
            return {
              error: `I couldn't find an event matching "${params.searchQuery}"`
            };
          }
          eventId = event.id;
          eventTitle = event.summary;
        }
      }

      if (!eventId) {
        return {
          error: 'Please specify either an event ID or a search query to find the event.'
        };
      }

      await calendarService.deleteEvent(eventId, params.sendNotifications);

      return {
        success: true,
        message: `I've deleted the event${eventTitle ? ` "${eventTitle}"` : ''} from your calendar.`
      };

    } catch (error) {
      console.error('Error deleting event:', error);
      return {
        error: 'I encountered an error while deleting the event. Please try again.'
      };
    }
  }
};

/**
 * Check free/busy times and detect conflicts
 */
export const checkFreeBusy = tool({
  name: 'checkFreeBusy',
  description: 'Check when the user is free or busy during a specified time range and detect scheduling conflicts',
  parameters: z.object({
    timeMin: z.string().describe('Start of time range to check (natural language or ISO)'),
    timeMax: z.string().describe('End of time range to check (natural language or ISO)')
  }),
  async execute(params) {
    console.log('🔧 checkFreeBusy called with:', JSON.stringify(params, null, 2));
    try {
      const initialized = await calendarService.initialize();
      if (!initialized) {
        return {
          error: 'Google Calendar is not connected. Please ask the user to connect their calendar through the admin interface.'
        };
      }

      // Parse time range
      const minParsed = parseDateTime(params.timeMin);
      const maxParsed = parseDateTime(params.timeMax);

      if (!minParsed || !maxParsed) {
        return {
          error: 'I couldn\'t understand the time range. Please provide clearer dates.'
        };
      }

      const freeBusy = await calendarService.checkFreeBusy(
        minParsed.start.toISOString(),
        maxParsed.start.toISOString()
      );

      const calendarId = process.env.GOOGLE_CALENDAR_ID || 'primary';
      const busyTimes = freeBusy[calendarId]?.busy || [];

      if (busyTimes.length === 0) {
        return {
          success: true,
          message: `You're completely free between ${formatDateForVoice(minParsed.start)} and ${formatDateForVoice(maxParsed.start)}`,
          freeTimes: [{
            start: minParsed.start,
            end: maxParsed.start
          }]
        };
      }

      // Format busy times for voice response
      const busyDescriptions = busyTimes.map(busy => 
        `busy from ${formatDateForVoice(new Date(busy.start))} to ${formatDateForVoice(new Date(busy.end))}`
      ).join(', ');

      return {
        success: true,
        message: `You have ${busyTimes.length} busy period${busyTimes.length > 1 ? 's' : ''}: ${busyDescriptions}`,
        busyTimes: busyTimes,
        isAvailable: busyTimes.length === 0,
        hasConflicts: busyTimes.length > 0
      };

    } catch (error) {
      console.error('Error checking free/busy:', error);
      return {
        error: 'I encountered an error while checking your availability. Please try again.'
      };
    }
  }
});

/**
 * Check for scheduling conflicts for a specific time slot
 */
export const checkSchedulingConflict = tool({
  name: 'checkSchedulingConflict',
  description: 'Check if a specific time slot conflicts with existing calendar events',
  parameters: z.object({
    startTime: z.string().describe('Start time of the proposed slot (natural language or ISO)'),
    endTime: z.string().describe('End time of the proposed slot (natural language or ISO)')
  }),
  async execute(params) {
    console.log('🔧 checkSchedulingConflict called with:', JSON.stringify(params, null, 2));
    
    try {
      const initialized = await calendarService.initialize();
      if (!initialized) {
        return {
          error: 'Google Calendar is not connected. Please ask the user to connect their calendar through the admin interface.'
        };
      }

      // Parse the proposed time slot
      const startParsed = parseDateTime(params.startTime);
      const endParsed = parseDateTime(params.endTime);

      if (!startParsed || !endParsed) {
        return {
          error: 'I couldn\'t understand the time slot. Please provide clearer dates and times.'
        };
      }

      // Check for conflicts
      const freeBusy = await calendarService.checkFreeBusy(
        startParsed.start.toISOString(),
        endParsed.start.toISOString()
      );

      const calendarId = process.env.GOOGLE_CALENDAR_ID || 'primary';
      const busyTimes = freeBusy[calendarId]?.busy || [];

      const hasConflict = busyTimes.length > 0;
      
      if (hasConflict) {
        const conflictDescriptions = busyTimes.map(busy => 
          `conflict from ${formatDateForVoice(new Date(busy.start))} to ${formatDateForVoice(new Date(busy.end))}`
        ).join(', ');

        return {
          success: true,
          hasConflict: true,
          message: `The requested time slot conflicts with existing events: ${conflictDescriptions}`,
          conflicts: busyTimes,
          isAvailable: false
        };
      } else {
        return {
          success: true,
          hasConflict: false,
          message: `The time slot from ${formatDateForVoice(startParsed.start)} to ${formatDateForVoice(endParsed.start)} is available`,
          isAvailable: true,
          conflicts: []
        };
      }

    } catch (error) {
      console.error('Error checking scheduling conflict:', error);
      return {
        error: 'I encountered an error while checking for conflicts. Please try again.'
      };
    }
  }
});
