# WATI Webhook Setup Guide

This guide will help you set up WATI webhook integration for automated bike pricing responses.

## 1. Environment Configuration

Add these environment variables to your `.env` file:

```env
# WATI Configuration
WATI_BASE_URL=https://live-server-109100.wati.io
WATI_API_TOKEN=your_wati_api_token_here
```

## 2. WATI Dashboard Setup

### Step 1: Get Your API Token
1. Log into your WATI dashboard
2. Go to **Settings** → **API & Webhooks**
3. Copy your **API Token**

### Step 2: Configure Webhook URL
1. In WATI dashboard, go to **Settings** → **API & Webhooks**
2. Set your webhook URL to: `https://your-domain.com/api/wati/webhook`
3. Enable the following events:
   - `message_received`
   - `contact_created`
   - `message_status`

### Step 3: Test Webhook Connection
1. Use the "Test Webhook" button in WATI dashboard
2. Check your server logs to ensure webhook is received

## 3. API Endpoints Created

### Webhook Endpoint
- **URL**: `POST /api/wati/webhook`
- **Purpose**: Receives incoming messages from WATI
- **Authentication**: None (WATI will call this endpoint)

### Management Endpoints
- **URL**: `GET /api/wati/leads`
- **Purpose**: Get WATI message leads
- **Query Parameters**: 
  - `page` (default: 1)
  - `limit` (default: 20)
  - `is_sell_lead` (true/false)

- **URL**: `GET /api/wati/contacts`
- **Purpose**: Get WATI contacts
- **Query Parameters**: 
  - `page` (default: 1)
  - `limit` (default: 20)

## 4. How It Works

### Message Flow
1. Customer sends WhatsApp message to your WATI number
2. WATI sends webhook to your server (`/api/wati/webhook`)
3. System extracts bike details from message
4. If pricing request detected:
   - Calculates bike price using your existing engine
   - Sends formatted price quote back via WhatsApp
   - Creates lead in database and Google Sheets
5. If not a pricing request:
   - Sends general response asking for bike details

### Supported Message Formats
Customers can send messages like:
- "I want to sell my Honda Activa 2020, 15000 km, 1st owner"
- "What's the price of Bajaj Pulsar 2019 with 25000 km?"
- "Quote for Yamaha R15 2021, 2nd owner, 30000 km"

## 5. Testing the Integration

### Test 1: Basic Webhook
```bash
curl -X POST https://your-domain.com/api/wati/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "eventType": "message_received",
    "data": {
      "waId": "919876543210",
      "senderName": "Test User",
      "messageBody": "I want to sell my Honda Activa 2020, 15000 km, 1st owner"
    }
  }'
```

### Test 2: Check Leads
```bash
curl -X GET https://your-domain.com/api/wati/leads
```

### Test 3: Check Contacts
```bash
curl -X GET https://your-domain.com/api/wati/contacts
```

## 6. Message Templates (Optional)

You can create message templates in WATI dashboard for consistent messaging:

### Template 1: Price Quote
```
🏍️ *Price Quote for {{1}} {{2}}*

📊 *Pricing Details:*
• New Bike Price: ₹{{3}}
• Market Value: ₹{{4}}
• Our Offer: ₹{{5}}

💰 *Price Range:*
• Minimum: ₹{{6}}
• Maximum: ₹{{7}}

*Note:* This is an estimated price. Final price may vary based on bike condition and inspection.

Would you like to schedule a free inspection? Reply with "YES" to proceed!
```

### Template 2: Incomplete Details
```
Hi {{1}}! 

I need a few more details to give you an accurate price quote:

{{2}}

Please share these details and I'll calculate the price for you!
```

## 7. Database Tables Used

### wati_contacts
Stores WATI contact information
- `wa_id`: WhatsApp ID
- `sender_name`: Contact name
- `meta_data`: Additional contact data

### wati_message_leads
Stores all incoming messages and their processing status
- `waId`: WhatsApp ID
- `messageContact`: Contact info
- `senderName`: Sender name
- `is_sell_lead`: Whether it's a pricing request
- `meta_data`: Full message data

### pricing_engine_lead_form
Stores leads created from WATI interactions
- `lead_source`: Set to 'wati_whatsapp'
- `price_response`: Contains bike details and pricing

## 8. Troubleshooting

### Common Issues

1. **Webhook not receiving messages**
   - Check webhook URL in WATI dashboard
   - Verify server is accessible from internet
   - Check server logs for errors

2. **Messages not being processed**
   - Check WATI_API_TOKEN in environment
   - Verify database connection
   - Check server logs for processing errors

3. **Pricing calculation failing**
   - Ensure bike details are properly extracted
   - Check if bike exists in bike_features table
   - Verify pricing engine service is working

### Debug Commands

```bash
# Check if webhook endpoint is accessible
curl -X POST https://your-domain.com/api/wati/webhook \
  -H "Content-Type: application/json" \
  -d '{"test": "webhook"}'

# Check server logs
tail -f your-app-logs.log

# Test WATI API connection
curl -X GET https://live-server-109100.wati.io/api/v1/getContact/919876543210 \
  -H "Authorization: Bearer YOUR_API_TOKEN"
```

## 9. Production Deployment

### Security Considerations
1. Add webhook signature verification (optional)
2. Rate limiting on webhook endpoint
3. Input validation and sanitization
4. Error handling and logging

### Monitoring
1. Set up alerts for webhook failures
2. Monitor message processing times
3. Track lead conversion rates
4. Monitor API rate limits

## 10. Next Steps

1. Set up your WATI account and get API token
2. Configure webhook URL in WATI dashboard
3. Test with sample messages
4. Monitor and optimize based on real usage
5. Consider adding more sophisticated NLP for better message parsing
6. Implement follow-up automation for inspection scheduling

## Support

If you encounter any issues:
1. Check server logs for error messages
2. Verify WATI dashboard configuration
3. Test individual components (webhook, pricing engine, database)
4. Contact WATI support for API-related issues
