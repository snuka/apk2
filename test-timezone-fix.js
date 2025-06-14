import dotenv from 'dotenv';
import { formatDateForVoice } from './utils/dateTimeParser.js';
import CalendarService from './services/calendarService.js';

dotenv.config();

const calendarService = new CalendarService();

async function testTimezoneFix() {
  console.log('🧪 Testing Timezone Fix\n');
  
  // Test 1: Format UTC date to PST
  console.log('Test 1: Formatting UTC dates to PST');
  const utcDate = new Date('2025-06-14T18:00:00Z'); // 6pm UTC = 11am PST
  console.log('UTC Date:', utcDate.toISOString());
  console.log('Formatted for voice (PST):', formatDateForVoice(utcDate, true, 'America/Los_Angeles'));
  console.log('Expected: Saturday, June 14, 2025 at 11:00 AM\n');

  // Test 2: Another example
  const utcDate2 = new Date('2025-06-15T01:00:00Z'); // 1am UTC = 6pm PST (previous day)
  console.log('UTC Date:', utcDate2.toISOString());
  console.log('Formatted for voice (PST):', formatDateForVoice(utcDate2, true, 'America/Los_Angeles'));
  console.log('Expected: Saturday, June 14, 2025 at 6:00 PM\n');

  // Test 3: List actual calendar events if connected
  const initialized = await calendarService.initialize();
  if (initialized) {
    console.log('Test 3: Listing actual calendar events');
    
    try {
      const events = await calendarService.listEvents({
        timeMin: new Date().toISOString(),
        timeMax: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        maxResults: 3
      });

      if (events.length > 0) {
        console.log(`Found ${events.length} events:\n`);
        
        events.forEach((event, index) => {
          console.log(`Event ${index + 1}: ${event.summary}`);
          const eventDate = new Date(event.start.dateTime || event.start.date);
          console.log('  Raw date from Google:', event.start.dateTime || event.start.date);
          console.log('  Formatted for voice:', formatDateForVoice(eventDate, true, 'America/Los_Angeles'));
          console.log('');
        });
      } else {
        console.log('No upcoming events found');
      }
    } catch (error) {
      console.error('Error listing events:', error.message);
    }
  } else {
    console.log('Calendar not connected - skipping live event test');
  }

  console.log('\n✅ Timezone fix test completed');
  console.log('The fix ensures that all dates are displayed in PST regardless of the UTC time returned by Google Calendar');
}

testTimezoneFix().catch(console.error);
