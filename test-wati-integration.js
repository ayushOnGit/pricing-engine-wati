/**
 * Test script for WATI integration
 * Run this to test your WATI webhook setup
 */

const axios = require('axios');

// Configuration
const BASE_URL = 'http://localhost:3000'; // Change to your server URL
const TEST_PHONE = '919876543210'; // Test phone number

// Test data
const testMessages = [
  {
    name: 'Complete Pricing Request',
    data: {
      eventType: 'message_received',
      data: {
        waId: TEST_PHONE,
        senderName: 'Test User',
        messageContact: TEST_PHONE,
        messageBody: 'I want to sell my Honda Activa 2020, 15000 km, 1st owner',
        timestamp: new Date().toISOString(),
        id: 'test-msg-1',
        type: 'text'
      }
    }
  },
  {
    name: 'Incomplete Details',
    data: {
      eventType: 'message_received',
      data: {
        waId: TEST_PHONE,
        senderName: 'Test User 2',
        messageContact: TEST_PHONE,
        messageBody: 'I want to sell my bike',
        timestamp: new Date().toISOString(),
        id: 'test-msg-2',
        type: 'text'
      }
    }
  },
  {
    name: 'General Inquiry',
    data: {
      eventType: 'message_received',
      data: {
        waId: TEST_PHONE,
        senderName: 'Test User 3',
        messageContact: TEST_PHONE,
        messageBody: 'Hello, how are you?',
        timestamp: new Date().toISOString(),
        id: 'test-msg-3',
        type: 'text'
      }
    }
  }
];

async function testWebhook() {
  console.log('🧪 Testing WATI Webhook Integration\n');
  
  for (const test of testMessages) {
    console.log(`📝 Testing: ${test.name}`);
    
    try {
      const response = await axios.post(`${BASE_URL}/api/wati/webhook`, test.data, {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 10000
      });
      
      console.log(`✅ Success: ${response.status} - ${response.data.message}`);
    } catch (error) {
      console.log(`❌ Error: ${error.response?.status || 'Network Error'} - ${error.response?.data?.message || error.message}`);
    }
    
    console.log('---');
  }
}

async function testEndpoints() {
  console.log('\n🔍 Testing Management Endpoints\n');
  
  const endpoints = [
    { name: 'Get Leads', url: '/api/wati/leads' },
    { name: 'Get Contacts', url: '/api/wati/contacts' }
  ];
  
  for (const endpoint of endpoints) {
    console.log(`📊 Testing: ${endpoint.name}`);
    
    try {
      const response = await axios.get(`${BASE_URL}${endpoint.url}`, {
        timeout: 5000
      });
      
      console.log(`✅ Success: ${response.status}`);
      console.log(`📈 Data: ${JSON.stringify(response.data.data?.pagination || response.data.data?.length || 'No data')}`);
    } catch (error) {
      console.log(`❌ Error: ${error.response?.status || 'Network Error'} - ${error.response?.data?.message || error.message}`);
    }
    
    console.log('---');
  }
}

async function testWATIService() {
  console.log('\n🔧 Testing WATI Service Functions\n');
  
  // Test phone number formatting
  const watiService = require('./api/services/external/wati');
  
  const testNumbers = ['+919876543210', '9876543210', '919876543210'];
  
  console.log('📱 Testing phone number formatting:');
  testNumbers.forEach(num => {
    const formatted = watiService.formatPhoneNumber(num);
    console.log(`  ${num} → ${formatted}`);
  });
  
  console.log('\n🏍️ Testing bike details extraction:');
  const testMessage = 'I want to sell my Honda Activa 2020, 15000 km, 1st owner';
  const details = watiService.extractBikeDetails(testMessage);
  console.log(`  Message: "${testMessage}"`);
  console.log(`  Extracted: ${JSON.stringify(details, null, 2)}`);
}

async function runAllTests() {
  try {
    await testWATIService();
    await testWebhook();
    await testEndpoints();
    
    console.log('\n🎉 All tests completed!');
    console.log('\n📋 Next Steps:');
    console.log('1. Set up your WATI API token in .env file');
    console.log('2. Configure webhook URL in WATI dashboard');
    console.log('3. Test with real WhatsApp messages');
    console.log('4. Monitor logs for any issues');
    
  } catch (error) {
    console.error('❌ Test suite failed:', error.message);
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  runAllTests();
}

module.exports = {
  testWebhook,
  testEndpoints,
  testWATIService,
  runAllTests
};

