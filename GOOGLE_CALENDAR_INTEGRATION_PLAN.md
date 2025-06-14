# Google Calendar Voice AI Integration Plan

## Overview
This document outlines the implementation plan for integrating Google Calendar functionality into the AlwaysPickup voice AI system, enabling users to manage calendar events through voice commands.

## Project Goals
- Enable voice-controlled calendar management (create, update, delete, query events)
- Support natural language date/time processing
- Implement secure OAuth2 authentication
- Create OpenAI function tools following best practices
- Maintain conversation context for follow-up queries

## Implementation Tracker

### Phase 1: Setup & Authentication ✅
- [x] Set up Google Cloud Project
- [x] Enable Google Calendar API
- [x] Create OAuth2 credentials
- [x] Install googleapis dependencies
- [x] Implement authentication flow
- [x] Create credential storage system
- [x] Build admin UI for Google authentication
- [x] Add OAuth2 endpoints to backend
- [x] Implement secure token storage
- [x] Create connection status display

### Phase 2: Core Function Tools ✅
- [x] Create `createCalendarEvent` tool
- [x] Create `listCalendarEvents` tool
- [x] Create `updateCalendarEvent` tool
- [x] Create `deleteCalendarEvent` tool
- [x] Create `checkFreeBusy` tool
- [x] Create `quickAddEvent` tool

### Phase 3: Natural Language Processing ✅
- [x] Implement date/time parsing utility
- [x] Add relative date support ("tomorrow", "next week")
- [x] Handle timezone conversions
- [x] Create event search functionality
- [x] Add context management for follow-ups

### Phase 4: Integration with RealtimeAgent 🟨
- [x] Update agent configuration
- [x] Add calendar-specific instructions
- [x] Integrate function tools
- [ ] Test voice command recognition
- [x] Handle error responses gracefully

### Phase 5: Advanced Features 🟨
- [x] Implement recurring event support
- [x] Add attendee management
- [ ] Support multiple calendars
- [ ] Add conflict detection
- [x] Implement reminder settings

### Phase 6: Testing & Optimization ⬜
- [ ] Unit tests for each function
- [ ] Integration tests with mock API
- [ ] End-to-end voice testing
- [ ] Performance optimization
- [ ] Error handling improvements

## Detailed Implementation Steps

### Step 1: Google Cloud Setup
1. Create a new Google Cloud Project
2. Enable the Google Calendar API
3. Create OAuth2 credentials (or service account)
4. Download credentials JSON file
5. Set up environment variables

### Step 2: Install Dependencies
```bash
npm install googleapis @google-cloud/local-auth date-fns chrono-node zod
```

### Step 3: Create Authentication Module
```typescript
// auth/googleCalendar.ts
- Initialize OAuth2 client
- Implement token storage
- Handle token refresh
- Create auth middleware
```

### Step 4: Implement Calendar Service
```typescript
// services/calendarService.ts
- Create Calendar API client
- Implement CRUD operations
- Add error handling
- Support batch operations
```

### Step 5: Create Function Tools
Each tool will follow this structure:
```typescript
const toolName = tool({
  name: 'toolName',
  description: 'Clear description for LLM',
  parameters: z.object({
    // Zod schema
  }),
  async execute({ params }, context) {
    // Implementation
  }
});
```

### Step 6: Natural Language Processing
```typescript
// utils/dateTimeParser.ts
- Parse natural language dates
- Handle relative dates
- Support recurring patterns
- Manage timezones
```

### Step 7: Update RealtimeAgent
```typescript
// Modify server.js
const agent = new RealtimeAgent({
  name: 'AlwaysPickup Assistant',
  instructions: updatedInstructions,
  voice: voice,
  tools: [
    createCalendarEvent,
    listCalendarEvents,
    updateCalendarEvent,
    deleteCalendarEvent,
    checkFreeBusy,
    quickAddEvent
  ]
});
```

## Admin UI Authentication Flow

### Overview
The admin interface will provide a user-friendly way to authenticate with Google Calendar without manual credential configuration.

### UI Components

#### 1. Google Calendar Section
- **Status Card**: Shows connection status
- **Connect Button**: Initiates OAuth2 flow
- **Account Display**: Shows connected Google account email
- **Disconnect Option**: Removes stored credentials

#### 2. OAuth2 Flow Steps
1. Admin clicks "Connect Google Calendar"
2. Redirected to Google consent screen
3. User authorizes calendar access
4. Redirected back to admin with success/error
5. Tokens stored securely in backend

### Backend OAuth Endpoints

```typescript
// OAuth2 endpoints to implement
GET  /api/auth/google/init      // Start OAuth2 flow
GET  /api/auth/google/callback  // Handle OAuth2 callback
GET  /api/auth/google/status    // Check connection status
POST /api/auth/google/disconnect // Remove stored tokens
```

### Admin Interface Updates

#### Component Structure
```typescript
// admin/src/components/GoogleCalendarAuth.tsx
- ConnectionStatus component
- ConnectButton component
- AccountInfo component
- DisconnectButton component

// admin/src/hooks/useGoogleAuth.ts
- Custom hook for auth state management
- OAuth flow handling
- Status checking
```

### Security Implementation
- CSRF token validation
- State parameter for OAuth2
- Encrypted token storage
- Session-based authentication
- Refresh token handling

### User Experience Flow
1. **Not Connected State**
   - Shows "Connect Google Calendar" button
   - Explains benefits of connection
   - Lists required permissions

2. **Connecting State**
   - Loading indicator
   - "Redirecting to Google..." message
   - Cancel option

3. **Connected State**
   - Green checkmark indicator
   - Connected account email
   - Last sync timestamp
   - Disconnect option

4. **Error State**
   - Clear error message
   - Retry button
   - Help documentation link

## Voice Command Examples

### Event Creation
- "Schedule a meeting tomorrow at 2 PM"
- "Book a dentist appointment next Tuesday at 10 AM"
- "Create a recurring team standup every weekday at 9 AM"

### Event Queries
- "What's on my calendar today?"
- "Do I have any meetings this afternoon?"
- "What's my schedule for next week?"

### Event Updates
- "Move my 2 PM meeting to 4 PM"
- "Change the location of tomorrow's meeting to Conference Room B"
- "Add John to the product review meeting"

### Event Deletion
- "Cancel my 3 o'clock appointment"
- "Delete all meetings for Friday"
- "Remove the recurring standup"

### Availability Checking
- "When am I free tomorrow?"
- "Find a 30-minute slot this week"
- "Check if I'm available Friday at 2 PM"

## Function Tool Specifications

### 1. createCalendarEvent
**Purpose**: Create new calendar events with full details
**Parameters**:
- summary (required): Event title
- startDateTime: Start time (ISO 8601 or natural language)
- endDateTime: End time (optional, defaults to 1 hour)
- allDay: Boolean for all-day events
- description: Event description
- location: Physical or virtual location
- attendees: Array of email addresses
- recurrence: Recurring event configuration
- reminders: Array of reminder settings

### 2. quickAddEvent
**Purpose**: Create events from natural language
**Parameters**:
- text: Natural language event description

### 3. listCalendarEvents
**Purpose**: Query calendar events with filters
**Parameters**:
- timeMin: Start of time range
- timeMax: End of time range
- searchQuery: Text search in events
- maxResults: Limit number of results
- showDeleted: Include deleted events

### 4. checkFreeBusy
**Purpose**: Check availability for scheduling
**Parameters**:
- timeMin: Start of range to check
- timeMax: End of range to check
- calendars: Calendar IDs to check

### 5. updateCalendarEvent
**Purpose**: Modify existing events
**Parameters**:
- eventId: Event identifier (or use search)
- searchQuery: Find event by title
- updates: Object with fields to update

### 6. deleteCalendarEvent
**Purpose**: Remove calendar events
**Parameters**:
- eventId: Event identifier (or use search)
- searchQuery: Find event by title
- sendNotifications: Notify attendees

## Security Considerations

### Authentication
- Use OAuth2 for user consent
- Store tokens securely (encrypted)
- Implement token refresh logic
- Handle expired credentials

### Permissions
- Request minimal scopes needed
- Validate user permissions
- Log all calendar modifications
- Implement rate limiting

### Data Privacy
- Don't log sensitive event details
- Encrypt stored credentials
- Follow GDPR compliance
- Allow data deletion

## Error Handling Strategy

### API Errors
- Rate limit exceeded → Implement backoff
- Invalid credentials → Re-authenticate
- Network errors → Retry with timeout
- Quota exceeded → Queue requests

### User Errors
- Invalid date/time → Request clarification
- Missing permissions → Explain and guide
- Conflicting events → Offer alternatives
- Ambiguous requests → Ask for specifics

## Testing Plan

### Unit Tests
- Date parsing functions
- API request builders
- Error handlers
- Response formatters

### Integration Tests
- OAuth flow
- API operations
- Tool execution
- Context management

### End-to-End Tests
- Voice command processing
- Multi-turn conversations
- Error scenarios
- Performance benchmarks

## Performance Optimization

### Caching
- Cache calendar metadata
- Store frequently accessed events
- Implement smart invalidation

### Batch Operations
- Group API requests
- Use partial responses
- Implement pagination

### Response Time
- Preload common data
- Async processing
- Stream responses

## Monitoring & Analytics

### Metrics to Track
- API call volume
- Response times
- Error rates
- Feature usage
- User satisfaction

### Logging
- API requests/responses
- Error details
- Performance metrics
- User interactions

## Future Enhancements

### Phase 2 Features
- Multi-calendar support
- Shared calendar access
- Meeting room booking
- Travel time calculation
- Weather integration

### Advanced Capabilities
- Smart scheduling suggestions
- Conflict resolution
- Meeting preparation reminders
- Calendar analytics
- Integration with other services

## Dependencies

### NPM Packages
- `googleapis`: Google Calendar API client
- `@google-cloud/local-auth`: OAuth2 authentication
- `date-fns`: Date manipulation
- `chrono-node`: Natural language date parsing
- `zod`: Schema validation
- `dotenv`: Environment variables

### Environment Variables
```env
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret
GOOGLE_REDIRECT_URI=http://localhost:3000/auth/callback
GOOGLE_CALENDAR_ID=primary
```

## Resources

### Documentation
- [Google Calendar API Concepts](https://developers.google.com/workspace/calendar/api/concepts/events-calendars)
- [Google Calendar API Reference](https://developers.google.com/workspace/calendar/api/v3/reference)
- [OAuth2 for Web Apps](https://developers.google.com/identity/protocols/oauth2/web-server)
- [OpenAI Function Calling](https://platform.openai.com/docs/guides/function-calling)

### Code Examples
- [Google Calendar Quickstart](https://developers.google.com/calendar/api/quickstart/nodejs)
- [OAuth2 Implementation](https://github.com/googleapis/google-api-nodejs-client)
- [Natural Language Date Parsing](https://github.com/wanasit/chrono)

## Success Criteria

### Functional Requirements
- ✅ Users can create events via voice
- ✅ Users can query their calendar
- ✅ Users can update/delete events
- ✅ System handles natural language
- ✅ Authentication is secure

### Non-Functional Requirements
- ✅ Response time < 2 seconds
- ✅ 99% uptime availability
- ✅ Handles 100+ concurrent users
- ✅ Passes security audit
- ✅ Maintains conversation context

## Timeline

### Week 1
- Days 1-2: Setup and authentication
- Days 3-5: Core function tools

### Week 2
- Days 6-7: Natural language processing
- Days 8-9: RealtimeAgent integration
- Day 10: Initial testing

### Week 3
- Days 11-12: Advanced features
- Days 13-14: Testing and debugging
- Day 15: Documentation and deployment

## Notes

### Design Decisions
- Use function tools pattern for modularity
- Implement strict parameter validation
- Support both OAuth2 and service accounts
- Cache frequently accessed data
- Use natural language for all responses

### Known Limitations
- Google Calendar API rate limits
- Maximum event description length
- Recurring event complexity
- Cross-timezone challenges
- Multi-language support (future)

---

**Last Updated**: June 14, 2025
**Status**: OAuth Authentication Complete - Implementation In Progress
**Next Step**: Add context management for follow-ups and test voice command recognition
