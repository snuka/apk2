import { parseISO, isValid } from 'date-fns';

/**
 * Parse date/time strings that are already in a structured format
 * @param {string} text - ISO 8601 date string or standard date format
 * @param {Date} referenceDate - Reference date for context (optional)
 * @returns {Object|null} Parsed date information or null if invalid
 */
export function parseDateTime(text, referenceDate = new Date()) {
  console.log('🕐 Parsing date/time:', text);
  
  try {
    // Try parsing as ISO 8601
    const date = parseISO(text);
    
    if (isValid(date)) {
      return {
        start: date,
        end: date,
        allDay: false,
        text: text,
        index: 0,
        timezone: 'America/Los_Angeles'
      };
    }
    
    // Try parsing as standard JavaScript date
    const standardDate = new Date(text);
    
    if (isValid(standardDate)) {
      return {
        start: standardDate,
        end: standardDate,
        allDay: false,
        text: text,
        index: 0,
        timezone: 'America/Los_Angeles'
      };
    }
    
    console.log('🕐 Could not parse date:', text);
    return null;
    
  } catch (error) {
    console.log('🕐 Error parsing date:', error);
    return null;
  }
}

/**
 * Parse recurring event patterns
 * @param {string} text - Text containing recurrence pattern
 * @returns {Array<string>} RRULE strings for Google Calendar
 */
export function parseRecurrence(text) {
  const lowerText = text.toLowerCase();
  const rules = [];

  // Daily patterns
  if (lowerText.includes('every day') || lowerText.includes('daily')) {
    rules.push('RRULE:FREQ=DAILY');
  }
  // Weekday patterns
  else if (lowerText.includes('every weekday') || lowerText.includes('weekdays')) {
    rules.push('RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR');
  }
  // Weekly patterns
  else if (lowerText.includes('every week') || lowerText.includes('weekly')) {
    rules.push('RRULE:FREQ=WEEKLY');
  }
  // Specific day patterns
  else if (lowerText.includes('every monday')) {
    rules.push('RRULE:FREQ=WEEKLY;BYDAY=MO');
  }
  else if (lowerText.includes('every tuesday')) {
    rules.push('RRULE:FREQ=WEEKLY;BYDAY=TU');
  }
  else if (lowerText.includes('every wednesday')) {
    rules.push('RRULE:FREQ=WEEKLY;BYDAY=WE');
  }
  else if (lowerText.includes('every thursday')) {
    rules.push('RRULE:FREQ=WEEKLY;BYDAY=TH');
  }
  else if (lowerText.includes('every friday')) {
    rules.push('RRULE:FREQ=WEEKLY;BYDAY=FR');
  }
  // Monthly patterns
  else if (lowerText.includes('every month') || lowerText.includes('monthly')) {
    rules.push('RRULE:FREQ=MONTHLY');
  }

  return rules;
}

/**
 * Format date for display in voice responses
 * @param {Date} date - Date to format
 * @param {boolean} includeTime - Whether to include time
 * @returns {string} Formatted date string
 */
export function formatDateForVoice(date, includeTime = true) {
  const options = {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  };

  if (includeTime) {
    options.hour = 'numeric';
    options.minute = 'numeric';
    options.hour12 = true;
  }

  return new Intl.DateTimeFormat('en-US', options).format(date);
}

/**
 * Convert date to Google Calendar format
 * @param {Date} date - Date to convert
 * @param {boolean} allDay - Whether this is an all-day event
 * @param {string} timezone - Optional timezone override (e.g., 'America/Los_Angeles' for PST)
 * @returns {Object} Google Calendar date object
 */
export function toGoogleCalendarDate(date, allDay = false, timezone = null) {
  if (allDay) {
    return {
      date: date.toISOString().split('T')[0]
    };
  } else {
    // If timezone is provided, use it; otherwise use the date's timezone or system timezone
    const timeZone = timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
    
    return {
      dateTime: date.toISOString(),
      timeZone: timeZone
    };
  }
}

/**
 * Parse duration from text
 * @param {string} text - Text containing duration
 * @returns {number} Duration in minutes
 */
export function parseDuration(text) {
  const lowerText = text.toLowerCase();
  
  // Extract numbers
  const numbers = text.match(/\d+/g);
  const firstNumber = numbers ? parseInt(numbers[0]) : 1;

  if (lowerText.includes('hour')) {
    return firstNumber * 60;
  } else if (lowerText.includes('minute')) {
    return firstNumber;
  } else if (lowerText.includes('half')) {
    return 30;
  } else {
    // Default to 1 hour
    return 60;
  }
}

/**
 * Extract email addresses from text
 * @param {string} text - Text containing email addresses
 * @returns {Array<Object>} Array of attendee objects
 */
export function extractEmails(text) {
  const emailRegex = /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/g;
  const emails = text.match(emailRegex) || [];
  
  return emails.map(email => ({ email: email.toLowerCase() }));
}

/**
 * Parse time range from text
 * @param {string} text - Text like "from 2pm to 4pm"
 * @returns {Object} Object with start and end times
 */
export function parseTimeRange(text, referenceDate = new Date()) {
  // Try chrono first for complex patterns
  const results = chrono.parse(text, referenceDate);
  
  if (results.length > 0 && results[0].end) {
    return {
      start: results[0].start.date(),
      end: results[0].end.date()
    };
  }

  // Simple pattern matching for "X to Y" format
  const rangeMatch = text.match(/from\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s+to\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i);
  
  if (rangeMatch) {
    const startTimeStr = `${referenceDate.toDateString()} ${rangeMatch[1]}`;
    const endTimeStr = `${referenceDate.toDateString()} ${rangeMatch[2]}`;
    
    const start = chrono.parseDate(startTimeStr);
    const end = chrono.parseDate(endTimeStr);
    
    if (start && end) {
      return { start, end };
    }
  }

  return null;
}
