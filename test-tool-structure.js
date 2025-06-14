import {
  createCalendarEvent,
  listCalendarEvents,
  updateCalendarEvent,
  deleteCalendarEvent
} from './tools/calendarTools.js';

console.log('🔍 Inspecting tool structure:\n');

console.log('createCalendarEvent properties:', Object.keys(createCalendarEvent));
console.log('createCalendarEvent type:', typeof createCalendarEvent);
console.log('createCalendarEvent:', createCalendarEvent);

// Check if it has the execute property from the tool definition
if (createCalendarEvent.execute) {
  console.log('\n✅ Has execute property');
}

// Check the actual structure
console.log('\nFull structure:', JSON.stringify(createCalendarEvent, null, 2));
