const prisma = require("../../db/prisma/prisma");
const watiService = require("./external/wati");
const { calculateUsedPrices } = require("./engine.service");
const { appendData } = require("./external/googleSheets");
const moment = require('moment-timezone');

class WATIAutomationService {
  
  /**
   * Process incoming WATI message and determine if it's a pricing request
   */
  async processIncomingMessage(messageData) {
    try {
      const { waId, messageBody, senderName } = messageData;
      
      // Extract bike details from message
      const bikeDetails = watiService.extractBikeDetails(messageBody);
      
      // Check if this is a pricing request
      const isPricingRequest = this.isPricingRequest(messageBody, bikeDetails);
      
      if (isPricingRequest) {
        return await this.handlePricingRequest(waId, messageBody, bikeDetails, senderName);
      } else {
        return await this.handleGeneralInquiry(waId, messageBody, senderName);
      }
      
    } catch (error) {
      console.error('Error processing incoming message:', error);
      throw error;
    }
  }

  /**
   * Check if message is a pricing request
   */
  isPricingRequest(message, bikeDetails) {
    const lowerMessage = message.toLowerCase();
    
    const pricingKeywords = [
      'price', 'cost', 'value', 'worth', 'sell', 'buy', 'quote', 'valuation',
      'how much', 'what price', 'pricing', 'estimate', 'appraisal', 'rate'
    ];
    
    const hasPricingKeyword = pricingKeywords.some(keyword => 
      lowerMessage.includes(keyword)
    );
    
    const hasBikeDetails = bikeDetails.year || bikeDetails.km || bikeDetails.make;
    
    return hasPricingKeyword || hasBikeDetails;
  }

  /**
   * Handle pricing request
   */
  async handlePricingRequest(waId, message, bikeDetails, senderName) {
    try {
      const phoneNumber = watiService.formatPhoneNumber(waId);
      
      // Check if we have enough details
      if (!this.hasEnoughDetails(bikeDetails)) {
        await this.sendIncompleteDetailsMessage(phoneNumber, bikeDetails, senderName);
        return { type: 'incomplete_details', bikeDetails };
      }

      // Calculate pricing
      const pricingResult = await this.calculateBikePricing(bikeDetails);
      
      if (pricingResult.success) {
        await this.sendPricingMessage(phoneNumber, bikeDetails, pricingResult.data, senderName);
        
        // Create lead entry
        await this.createLeadFromWATI(waId, bikeDetails, pricingResult.data, message);
        
        return { 
          type: 'pricing_success', 
          bikeDetails, 
          pricing: pricingResult.data 
        };
      } else {
        await this.sendPricingErrorMessage(phoneNumber, pricingResult.error, senderName);
        return { type: 'pricing_error', error: pricingResult.error };
      }
      
    } catch (error) {
      console.error('Error handling pricing request:', error);
      const phoneNumber = watiService.formatPhoneNumber(waId);
      await this.sendPricingErrorMessage(phoneNumber, 'Unable to process your request. Please try again later.', senderName);
      throw error;
    }
  }

  /**
   * Handle general inquiry
   */
  async handleGeneralInquiry(waId, message, senderName) {
    const phoneNumber = watiService.formatPhoneNumber(waId);
    
    const responseMessage = `Hi ${senderName || 'there'}! 👋

I can help you get an instant price quote for your bike! 

To get started, please share:
🏍️ Bike make and model (e.g., Honda Activa, Bajaj Pulsar)
📅 Year of registration
🛣️ Kilometers driven
👤 Number of owners (1st, 2nd, 3rd)

Just send me a message with these details and I'll give you an instant price quote!`;

    await watiService.sendMessage(phoneNumber, responseMessage);
    
    return { type: 'general_inquiry' };
  }

  /**
   * Check if we have enough details for pricing
   */
  hasEnoughDetails(bikeDetails) {
    return bikeDetails.make && bikeDetails.year && bikeDetails.km;
  }

  /**
   * Calculate bike pricing
   */
  async calculateBikePricing(bikeDetails) {
    try {
      const { make, model, variant, year, km, owner } = bikeDetails;
      
      // Try to find variant if not provided
      let finalVariant = variant;
      if (!finalVariant && make) {
        const bikeData = await prisma.$queryRaw`
          SELECT variant_name FROM bike_features 
          WHERE LOWER(CONCAT(brand_name, ' ', model_name)) LIKE LOWER(${make + '%'})
          LIMIT 1
        `;
        if (bikeData.length > 0) {
          finalVariant = bikeData[0].variant_name;
        }
      }

      if (!finalVariant) {
        return {
          success: false,
          error: 'Could not identify the bike variant. Please specify the exact model and variant.'
        };
      }

      const pricingData = {
        makeModel: make,
        variant: finalVariant,
        year: year,
        km: km,
        owner: owner || 1,
        type: 'bike'
      };

      const result = await calculateUsedPrices(pricingData);
      
      return {
        success: true,
        data: result
      };

    } catch (error) {
      console.error('Pricing calculation error:', error);
      return {
        success: false,
        error: 'Unable to calculate pricing for this bike. Please check the details and try again.'
      };
    }
  }

  /**
   * Send incomplete details message
   */
  async sendIncompleteDetailsMessage(phoneNumber, bikeDetails, senderName) {
    let missingDetails = [];
    if (!bikeDetails.make) missingDetails.push('🏍️ Bike make and model');
    if (!bikeDetails.year) missingDetails.push('📅 Year of registration');
    if (!bikeDetails.km) missingDetails.push('🛣️ Kilometers driven');
    if (!bikeDetails.owner) missingDetails.push('👤 Number of owners');

    const message = `Hi ${senderName || 'there'}! 

I need a few more details to give you an accurate price quote:

${missingDetails.join('\n')}

Please share these details and I'll calculate the price for you!`;

    await watiService.sendMessage(phoneNumber, message);
  }

  /**
   * Send pricing message
   */
  async sendPricingMessage(phoneNumber, bikeDetails, pricingData, senderName) {
    const { newPrice, usedPrice, postMarginCalculation, postMarkupCalculation } = pricingData;
    const { procurementPrice, procurementPriceMinRange, procurementPriceMaxRange } = postMarginCalculation;
    const { finalPrice, mspDiscountNewListing } = postMarkupCalculation;

    const message = `Hi ${senderName || 'there'}! 

🏍️ *Price Quote for ${bikeDetails.make} ${bikeDetails.year}*

📊 *Pricing Details:*
• New Bike Price: ₹${newPrice?.toLocaleString() || 'N/A'}
• Market Value: ₹${usedPrice?.toLocaleString() || 'N/A'}
• Our Offer: ₹${procurementPrice?.toLocaleString() || 'N/A'}

💰 *Price Range:*
• Minimum: ₹${procurementPriceMinRange?.toLocaleString() || 'N/A'}
• Maximum: ₹${procurementPriceMaxRange?.toLocaleString() || 'N/A'}

${mspDiscountNewListing ? `🎯 *MSP Discount: ${mspDiscountNewListing}%*` : ''}

*Note:* This is an estimated price. Final price may vary based on bike condition and inspection.

Would you like to schedule a free inspection? Reply with "YES" to proceed!`;

    await watiService.sendMessage(phoneNumber, message);
  }

  /**
   * Send pricing error message
   */
  async sendPricingErrorMessage(phoneNumber, errorMessage, senderName) {
    const message = `Hi ${senderName || 'there'}! 

Sorry, ${errorMessage}

Please make sure to provide:
🏍️ Correct bike make and model
📅 Valid year of registration  
🛣️ Accurate kilometers driven
👤 Number of owners

Try again with the correct details!`;

    await watiService.sendMessage(phoneNumber, message);
  }

  /**
   * Create lead from WATI interaction
   */
  async createLeadFromWATI(waId, bikeDetails, pricingData, originalMessage) {
    try {
      const IST = 'Asia/Kolkata';
      const customFormattedDate = moment().tz(IST).format('DD-MMM').toString();
      
      // Create lead in database
      const lead = await prisma.pricing_engine_lead_form.create({
        data: {
          lead_source: 'wati_whatsapp',
          source_specification: 'WhatsApp Automation',
          price_response: {
            bikeDetails,
            pricing: pricingData,
            originalMessage
          },
          email: null, // No email from WhatsApp
          selected_make: bikeDetails.make,
          selected_variant: bikeDetails.variant || 'Unknown',
          owner: (bikeDetails.owner || 1) - 1, // Convert to 0-based index
          km: bikeDetails.km,
          vutto_price: pricingData.postMarginCalculation?.procurementPrice || 0,
          year: bikeDetails.year,
          vehicle_registration: null,
          refurb_cost: 0
        }
      });

      // Submit to Google Sheets
      await this.submitLeadToSheets(customFormattedDate, waId, bikeDetails, pricingData);

      return lead;
    } catch (error) {
      console.error('Error creating lead from WATI:', error);
      // Don't throw error as this is not critical for the main flow
    }
  }

  /**
   * Submit lead data to Google Sheets
   */
  async submitLeadToSheets(date, phoneNumber, bikeDetails, pricingData) {
    try {
      const sheetData = [
        date,
        phoneNumber, // Using phone number instead of email
        bikeDetails.make,
        bikeDetails.variant || 'Unknown',
        (bikeDetails.owner || 1) - 1, // Convert to 0-based index
        bikeDetails.year,
        bikeDetails.km,
        null, // reg_no not available
        pricingData.postMarginCalculation?.procurementPrice || 0,
        pricingData.postMarginCalculation?.procurementPrice || 0,
        'wati_whatsapp',
        'WhatsApp Automation',
        0 // refurb_cost
      ];

      // Submit to both sheets
      await appendData([sheetData], 'test', '1GgenhWcUM7SI18BXkJUKf42I5fB1V0Y0Qnxcy_8Wgu8');
      await appendData([sheetData], 'leads_data', '1xkqK7-RZYg6JUeJqKP3B91ZiCBnWjleiNVwYaCLDmJk');
      
    } catch (error) {
      console.error('Error submitting to Google Sheets:', error);
      // Don't throw error as this is not critical
    }
  }

  /**
   * Handle follow-up messages (like "YES" for inspection)
   */
  async handleFollowUpMessage(waId, message, senderName) {
    const phoneNumber = watiService.formatPhoneNumber(waId);
    const lowerMessage = message.toLowerCase().trim();
    
    if (lowerMessage === 'yes' || lowerMessage.includes('inspection') || lowerMessage.includes('schedule')) {
      const responseMessage = `Great! 🎉

To schedule your free inspection, please:

1️⃣ Call us at: +91-XXXX-XXXX-XX
2️⃣ Or visit our website: [Your Website]
3️⃣ Or reply with your preferred time

Our team will contact you within 24 hours to schedule the inspection.

*What to expect during inspection:*
✅ Physical condition check
✅ Engine and performance test  
✅ Documentation verification
✅ Final price confirmation

Thank you for choosing us! 🏍️`;

      await watiService.sendMessage(phoneNumber, responseMessage);
      
      // You can also create a notification request here
      await this.createInspectionRequest(waId, senderName);
      
    } else {
      const responseMessage = `I'm here to help! 

For pricing queries, please share:
🏍️ Bike make and model
📅 Year of registration
🛣️ Kilometers driven
👤 Number of owners

For other queries, please call us at: +91-XXXX-XXXX-XX`;

      await watiService.sendMessage(phoneNumber, responseMessage);
    }
  }

  /**
   * Create inspection request
   */
  async createInspectionRequest(waId, senderName) {
    try {
      // You can create a notification request or lead for inspection
      // This depends on your existing notification system
      console.log(`Inspection requested by ${senderName} (${waId})`);
      
      // You might want to create an entry in notify_requests table
      // or send an email notification to your team
      
    } catch (error) {
      console.error('Error creating inspection request:', error);
    }
  }
}

module.exports = new WATIAutomationService();

