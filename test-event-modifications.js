import dotenv from 'dotenv';
dotenv.config();

import {
  createCalendarEvent,
  listCalendarEvents,
  updateCalendarEvent,
  deleteCalendarEvent,
  setContextManager
} from './tools/calendarTools.js';

console.log('🧪 Testing Calendar Event Modification Functions\n');

// Simple mock context manager for testing
const mockContextManager = {
  sessions: new Map(),
  
  getSession(sessionId) {
    if (!this.sessions.has(sessionId)) {
      this.sessions.set(sessionId, {
        lastEventsList: []
      });
    }
    return this.sessions.get(sessionId);
  },
  
  updateLastQuery(sessionId, queryType, queryParams, results) {
    const session = this.getSession(sessionId);
    if (queryType === 'listCalendarEvents' && results.events) {
      session.lastEventsList = results.events;
      console.log(`📝 Context updated with ${results.events.length} events`);
    }
  },
  
  findEventByReference(sessionId, reference) {
    const session = this.getSession(sessionId);
    const events = session.lastEventsList;
    
    if (!events || events.length === 0) {
      console.log('❌ No events in context');
      return null;
    }

    const cleanRef = reference.toLowerCase();
    const matchedEvent = events.find(event => 
      event.summary && event.summary.toLowerCase().includes(cleanRef)
    );

    if (matchedEvent) {
      console.log(`✅ Found event in context: ${matchedEvent.summary}`);
      return matchedEvent;
    }
    
    console.log(`❌ No event found in context matching: ${reference}`);
    return null;
  }
};

// Inject mock context manager
setContextManager(mockContextManager);

async function runTests() {
  console.log('Starting Calendar Modification Tests\n');
  
  try {
    // Test 1: Create a test event
    console.log('📅 Test 1: Creating a test event');
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(10, 0, 0, 0);
    
    // Access the invoke method
    const createResult = await createCalendarEvent.invoke({
      summary: 'Test Cooking Class',
      startDateTime: tomorrow.toISOString().replace(/\.\d{3}Z$/, '-07:00'),
      endDateTime: new Date(tomorrow.getTime() + 60 * 60 * 1000).toISOString().replace(/\.\d{3}Z$/, '-07:00'),
      allDay: false,
      description: 'Test event for modification testing',
      location: 'Test Kitchen',
      attendees: null,
      recurrence: null,
      reminders: null
    });
    
    if (createResult.error) {
      console.error('❌ Failed to create test event:', createResult.error);
      return;
    }
    
    console.log('✅ Created event:', createResult.message);
    console.log('   Event ID:', createResult.eventId);
    console.log('');
    
    // Test 2: List events to populate context
    console.log('📅 Test 2: Listing events to populate context');
    const today = new Date();
    const nextWeek = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
    
    const listResult = await listCalendarEvents.invoke({
      timeMin: today.toISOString(),
      timeMax: nextWeek.toISOString(),
      searchQuery: null,
      maxResults: 10
    });
    
    if (listResult.error) {
      console.error('❌ Failed to list events:', listResult.error);
    } else {
      console.log('✅ Listed events:', listResult.message);
      console.log('   Events in context:', listResult.events?.length || 0);
    }
    console.log('');
    
    // Test 3: Update event using search query
    console.log('📅 Test 3: Updating event using search query');
    const newTime = new Date(tomorrow);
    newTime.setHours(14, 0, 0, 0); // Change to 2pm
    
    const updateResult = await updateCalendarEvent.invoke({
      eventId: null,
      searchQuery: 'Test Cooking Class',
      updates: {
        summary: 'Updated Cooking Class',
        startDateTime: newTime.toISOString().replace(/\.\d{3}Z$/, '-07:00'),
        endDateTime: new Date(newTime.getTime() + 60 * 60 * 1000).toISOString().replace(/\.\d{3}Z$/, '-07:00'),
        location: 'Updated Kitchen',
        description: 'This event was successfully updated'
      }
    });
    
    if (updateResult.error) {
      console.error('❌ Failed to update event:', updateResult.error);
      
      // Try with partial match
      console.log('   Retrying with partial match...');
      const retryResult = await updateCalendarEvent.invoke({
        eventId: null,
        searchQuery: 'cooking',
        updates: {
          summary: 'Updated Cooking Class'
        }
      });
      
      if (retryResult.error) {
        console.error('   ❌ Retry also failed:', retryResult.error);
      } else {
        console.log('   ✅ Retry succeeded:', retryResult.message);
      }
    } else {
      console.log('✅ Updated event:', updateResult.message);
    }
    console.log('');
    
    // Test 4: Test context-based reference
    console.log('📅 Test 4: Testing context-based reference');
    const contextUpdateResult = await updateCalendarEvent.invoke({
      eventId: null,
      searchQuery: 'that cooking event',  // This should use context
      updates: {
        description: 'Updated via context reference'
      }
    });
    
    if (contextUpdateResult.error) {
      console.error('❌ Context reference failed:', contextUpdateResult.error);
    } else {
      console.log('✅ Context reference worked:', contextUpdateResult.message);
    }
    console.log('');
    
    // Test 5: Delete event using search query
    console.log('📅 Test 5: Deleting event using search query');
    const deleteResult = await deleteCalendarEvent.invoke({
      eventId: null,
      searchQuery: 'cooking',
      sendNotifications: false
    });
    
    if (deleteResult.error) {
      console.error('❌ Failed to delete event:', deleteResult.error);
    } else {
      console.log('✅ Deleted event:', deleteResult.message);
    }
    console.log('');
    
    // Summary
    console.log('\n🎯 Test Summary:');
    console.log('- Event creation: ' + (createResult.success ? '✅' : '❌'));
    console.log('- Event listing: ' + (listResult.success ? '✅' : '❌'));
    console.log('- Event update by search: ' + (updateResult.success ? '✅' : '❌'));
    console.log('- Context reference: ' + (contextUpdateResult.success ? '✅' : '❌'));
    console.log('- Event deletion: ' + (deleteResult.success ? '✅' : '❌'));
    
  } catch (error) {
    console.error('❌ Test error:', error);
  }
}

// Add delay to ensure calendar is initialized
setTimeout(runTests, 1000);
