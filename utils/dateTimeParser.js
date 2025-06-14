import * as chrono from 'chrono-node';
import { addHours, startOfDay, endOfDay, startOfWeek, endOfWeek, addDays } from 'date-fns';

/**
 * Parse natural language date/time strings into JavaScript Date objects
 * @param {string} text - Natural language date/time string
 * @param {Date} referenceDate - Reference date for relative dates (defaults to now)
 * @returns {Object} Parsed date information
 */
export function parseDateTime(text, referenceDate = new Date()) {
  console.log('🕐 Parsing date/time:', text);
  
  // First try timezone-specific patterns
  const timezoneResult = parseTimezonePatterns(text, referenceDate);
  if (timezoneResult) {
    console.log('🕐 Timezone pattern matched:', timezoneResult);
    return timezoneResult;
  }

  // Use chrono-node for natural language parsing
  const results = chrono.parse(text, referenceDate, { forwardDate: true });
  
  if (results.length === 0) {
    // Try some custom patterns if chrono fails
    return parseCustomPatterns(text, referenceDate);
  }

  const result = results[0];
  const start = result.start.date();
  const end = result.end ? result.end.date() : null;

  // If no end time specified, default to 1 hour duration for events
  const endTime = end || addHours(start, 1);

  const parsed = {
    start: start,
    end: endTime,
    allDay: !result.start.isCertain('hour'),
    text: result.text,
    index: result.index
  };

  console.log('🕐 Chrono parsed result:', parsed);
  return parsed;
}

/**
 * Parse timezone-specific patterns
 */
function parseTimezonePatterns(text, referenceDate) {
  const lowerText = text.toLowerCase();
  
  // PST/PDT specific patterns
  const pstPattern = /(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s*(?:to|-)?\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)?\s*pst|pdt/i;
  const match = lowerText.match(pstPattern);
  
  if (match) {
    console.log('🕐 PST pattern matched:', match);
    
    // Handle "today" context
    let baseDate = referenceDate;
    if (lowerText.includes('today')) {
      baseDate = new Date();
    } else if (lowerText.includes('tomorrow')) {
      baseDate = addDays(new Date(), 1);
    }
    
    // Parse start time
    const startTimeStr = match[1];
    const endTimeStr = match[2];
    
    try {
      // Create PST-specific date strings
      const dateStr = baseDate.toDateString();
      const startDateTime = chrono.parseDate(`${dateStr} ${startTimeStr} PST`);
      
      if (!startDateTime) {
        console.log('🕐 Failed to parse PST start time');
        return null;
      }
      
      let endDateTime;
      if (endTimeStr) {
        endDateTime = chrono.parseDate(`${dateStr} ${endTimeStr} PST`);
      } else {
        // Default to 1 hour duration
        endDateTime = addHours(startDateTime, 1);
      }
      
      const result = {
        start: startDateTime,
        end: endDateTime,
        allDay: false,
        text: text,
        index: 0,
        timezone: 'PST'
      };
      
      console.log('🕐 PST pattern result:', result);
      return result;
      
    } catch (error) {
      console.log('🕐 Error parsing PST time:', error);
      return null;
    }
  }
  
  // Time range patterns like "6-8pm", "6pm-8pm", "6 to 8pm"
  const rangePattern = /(\d{1,2}(?::\d{2})?)\s*(?:am|pm)?\s*(?:to|-)\s*(\d{1,2}(?::\d{2})?)\s*(am|pm)/i;
  const rangeMatch = text.match(rangePattern);
  
  if (rangeMatch) {
    console.log('🕐 Time range pattern matched:', rangeMatch);
    
    let baseDate = referenceDate;
    if (lowerText.includes('today')) {
      baseDate = new Date();
    } else if (lowerText.includes('tomorrow')) {
      baseDate = addDays(new Date(), 1);
    }
    
    const startTime = rangeMatch[1];
    const endTime = rangeMatch[2];
    const period = rangeMatch[3];
    
    try {
      const dateStr = baseDate.toDateString();
      
      // Handle cases like "6-8pm" where first time inherits the period
      const startTimeWithPeriod = startTime.includes('am') || startTime.includes('pm') ? 
        startTime : `${startTime}${period}`;
      const endTimeWithPeriod = endTime.includes('am') || endTime.includes('pm') ? 
        endTime : `${endTime}${period}`;
      
      const startDateTime = chrono.parseDate(`${dateStr} ${startTimeWithPeriod}`);
      const endDateTime = chrono.parseDate(`${dateStr} ${endTimeWithPeriod}`);
      
      if (startDateTime && endDateTime) {
        const result = {
          start: startDateTime,
          end: endDateTime,
          allDay: false,
          text: text,
          index: 0
        };
        
        console.log('🕐 Time range result:', result);
        return result;
      }
    } catch (error) {
      console.log('🕐 Error parsing time range:', error);
    }
  }
  
  return null;
}

/**
 * Parse custom patterns that chrono might miss
 */
function parseCustomPatterns(text, referenceDate) {
  const lowerText = text.toLowerCase();
  const now = referenceDate || new Date();

  // All day patterns
  if (lowerText.includes('all day')) {
    let date = now;
    
    if (lowerText.includes('tomorrow')) {
      date = addDays(now, 1);
    } else if (lowerText.includes('today')) {
      date = now;
    }

    return {
      start: startOfDay(date),
      end: endOfDay(date),
      allDay: true,
      text: text,
      index: 0
    };
  }

  // This week/next week patterns
  if (lowerText.includes('this week')) {
    return {
      start: startOfWeek(now, { weekStartsOn: 1 }), // Monday
      end: endOfWeek(now, { weekStartsOn: 1 }),
      allDay: false,
      text: text,
      index: 0
    };
  }

  if (lowerText.includes('next week')) {
    const nextWeek = addDays(now, 7);
    return {
      start: startOfWeek(nextWeek, { weekStartsOn: 1 }),
      end: endOfWeek(nextWeek, { weekStartsOn: 1 }),
      allDay: false,
      text: text,
      index: 0
    };
  }

  // If no patterns match, return null
  return null;
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
 * @returns {Object} Google Calendar date object
 */
export function toGoogleCalendarDate(date, allDay = false) {
  if (allDay) {
    return {
      date: date.toISOString().split('T')[0]
    };
  } else {
    return {
      dateTime: date.toISOString(),
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
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
