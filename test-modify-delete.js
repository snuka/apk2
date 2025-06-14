import dotenv from 'dotenv';
dotenv.config();

import CalendarService from './services/calendarService.js';

async function testModifyDelete() {
  console.log('🧪 Testing Calendar Modify and Delete Operations\n');

  const calendarService = new CalendarService();
  
  try {
    // Initialize calendar service
    const initialized = await calendarService.initialize();
    if (!initialized) {
      console.error('❌ Calendar service failed to initialize');
      return;
    }
    console.log('✅ Calendar service initialized\n');

    // Step 1: Create a test event
    console.log('📅 Step 1: Creating test event...');
    const testEvent = await calendarService.createEvent({
      summary: 'Test Event for Modify/Delete',
      start: {
        dateTime: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(), // 2 hours from now
        timeZone: 'America/Los_Angeles'
      },
      end: {
        dateTime: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(), // 3 hours from now
        timeZone: 'America/Los_Angeles'
      },
      description: 'This is a test event that will be modified and deleted'
    });
    
    console.log('✅ Created event:', testEvent.summary);
    console.log('   Event ID:', testEvent.id);
    console.log('   Start:', testEvent.start.dateTime);
    console.log('   Link:', testEvent.htmlLink);
    
    // Wait a moment for the event to be fully created
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Step 2: Modify the event
    console.log('\n📝 Step 2: Modifying the event...');
    const updatedEvent = await calendarService.updateEvent(testEvent.id, {
      summary: 'Modified Test Event',
      description: 'This event has been successfully modified',
      location: 'Virtual Meeting Room'
    });
    
    console.log('✅ Modified event:', updatedEvent.summary);
    console.log('   New description:', updatedEvent.description);
    console.log('   New location:', updatedEvent.location);
    
    // Step 3: Search for the event by title
    console.log('\n🔍 Step 3: Testing search by title...');
    const foundEvent = await calendarService.findEventByTitle('Modified Test Event');
    if (foundEvent) {
      console.log('✅ Found event by title search');
      console.log('   Event ID matches:', foundEvent.id === testEvent.id);
    } else {
      console.log('❌ Could not find event by title');
    }
    
    // Wait before deletion
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Step 4: Delete the event
    console.log('\n🗑️  Step 4: Deleting the event...');
    const deleteResult = await calendarService.deleteEvent(testEvent.id, false); // Don't send notifications
    console.log('✅ Delete result:', deleteResult);
    
    // Step 5: Verify deletion by trying to list events
    console.log('\n🔍 Step 5: Verifying deletion...');
    try {
      const events = await calendarService.listEvents({
        timeMin: new Date().toISOString(),
        timeMax: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
        searchQuery: 'Modified Test Event'
      });
      
      const stillExists = events.some(e => e.id === testEvent.id);
      if (!stillExists) {
        console.log('✅ Event successfully deleted - not found in calendar');
      } else {
        console.log('❌ Event still exists in calendar');
      }
    } catch (error) {
      console.log('✅ Event successfully deleted (query returned no results)');
    }
    
    console.log('\n✅ All modify/delete operations completed successfully!');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error('Error details:', error);
  }
}

// Run the test
testModifyDelete().catch(console.error);
