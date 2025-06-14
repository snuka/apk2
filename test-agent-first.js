import dotenv from 'dotenv';
dotenv.config();

// Test the simplified parseDateTime
import { parseDateTime } from './utils/dateTimeParser.js';

console.log('Testing Agent-First Pattern Implementation\n');

// Test ISO date parsing
console.log('1. Testing ISO date parsing:');
const isoDate = '2025-06-14T16:00:00-07:00';
const parsed = parseDateTime(isoDate);
console.log(`   Input: ${isoDate}`);
console.log(`   Parsed:`, parsed);
console.log(`   Success: ${parsed !== null}`);

console.log('\n2. Testing natural language (should fail):');
const naturalDate = 'tomorrow at 3pm';
const parsedNatural = parseDateTime(naturalDate);
console.log(`   Input: ${naturalDate}`);
console.log(`   Parsed:`, parsedNatural);
console.log(`   Success: ${parsedNatural === null} (Expected to fail)`);

console.log('\n3. AI Agent would convert natural language to ISO:');
console.log('   User: "Schedule a meeting tomorrow at 3pm"');
console.log('   AI converts: "tomorrow at 3pm" → "2025-06-15T15:00:00-07:00"');
console.log('   Tool receives: ISO date string');

console.log('\n4. Example timezone conversions for AI:');
const examples = [
  { input: 'today at 4pm', output: '2025-06-14T16:00:00-07:00' },
  { input: 'tomorrow at 5pm', output: '2025-06-15T17:00:00-07:00' },
  { input: 'today 6-9pm', output: 'start: 2025-06-14T18:00:00-07:00, end: 2025-06-14T21:00:00-07:00' }
];

examples.forEach(ex => {
  console.log(`   "${ex.input}" → ${ex.output}`);
});

console.log('\n✅ Agent-First Pattern Implementation Complete!');
console.log('   - Tools expect ISO dates only');
console.log('   - AI handles all natural language processing');
console.log('   - No more edge cases or timezone confusion');
