import dotenv from 'dotenv';
dotenv.config();

// Import the execute functions directly from the tool definitions
import { tool } from '@openai/agents';
import CalendarService from './services/calendarService.js';
import { formatDateForVoice, toGoogleCalendarDate } from './utils/dateTimeParser.js';

console.log('🧪 Testing Calendar Tool Execution Directly\n');

// Initialize calendar service
const calendarService = new CalendarService();

async function testDirectExecution() {
  try {
    // Check if calendar is initialized
    const initialized = await calendarService.initialize();
    if (!initialized) {
      console.error('❌ Google Calendar is not connected. Please connect through the admin interface.');
      return;
    }
    console.log('✅ Calendar service initialized\n');

    // Test 1: Create event directly
    console.log('📅 Test 1: Creating event directly via CalendarService');
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(10, 0, 0, 0);

    const eventData = {
      summary: 'Test Cooking Class for Modification',
      start: toGoogleCalendarDate(tomorrow, false, 'America/Los_Angeles'),
      end: toGoogleCalendarDate(new Date(tomorrow.getTime() + 60 * 60 * 1000), false, 'America/Los_Angeles'),
      description: 'Test event to verify modification functions',
      location: 'Test Kitchen'
    };

    const createdEvent = await calendarService.createEvent(eventData);
    console.log('✅ Created event:', createdEvent.summary);
    console.log('   Event ID:', createdEvent.id);
    console.log('   Event Link:', createdEvent.htmlLink);
    console.log('');

    // Test 2: List events
    console.log('📅 Test 2: Listing events');
    const events = await calendarService.listEvents({
      timeMin: new Date().toISOString(),
      timeMax: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      maxResults: 10
    });
    console.log(`✅ Found ${events.length} events`);
    const cookingEvent = events.find(e => e.summary && e.summary.includes('Cooking'));
    if (cookingEvent) {
      console.log('   Found our cooking event:', cookingEvent.summary);
      console.log('   Event ID:', cookingEvent.id);
    }
    console.log('');

    // Test 3: Find event by title
    console.log('📅 Test 3: Finding event by title');
    const foundEvent = await calendarService.findEventByTitle('Cooking');
    if (foundEvent) {
      console.log('✅ Found event by title:', foundEvent.summary);
      console.log('   Event ID:', foundEvent.id);
    } else {
      console.log('❌ Could not find event by title');
    }
    console.log('');

    // Test 4: Update event
    if (foundEvent) {
      console.log('📅 Test 4: Updating event');
      const newTime = new Date(tomorrow);
      newTime.setHours(14, 0, 0, 0); // 2pm
      
      const updateData = {
        summary: 'Updated Cooking Class',
        start: toGoogleCalendarDate(newTime, false, 'America/Los_Angeles'),
        end: toGoogleCalendarDate(new Date(newTime.getTime() + 60 * 60 * 1000), false, 'America/Los_Angeles'),
        description: 'Successfully updated via direct test'
      };
      
      const updatedEvent = await calendarService.updateEvent(foundEvent.id, updateData);
      console.log('✅ Updated event:', updatedEvent.summary);
      console.log('   New start time:', updatedEvent.start.dateTime);
    }
    console.log('');

    // Test 5: Delete event
    if (foundEvent) {
      console.log('📅 Test 5: Deleting event');
      await calendarService.deleteEvent(foundEvent.id, false);
      console.log('✅ Event deleted successfully');
    }

  } catch (error) {
    console.error('❌ Test error:', error);
    console.error('Error details:', error.message);
  }
}

testDirectExecution();
