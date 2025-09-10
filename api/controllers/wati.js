const prisma = require("../../db/prisma/prisma");
const watiService = require("../services/external/wati");
const watiAutomationService = require("../services/wati-automation.service");
const moment = require('moment');

/**
 * Handle incoming WATI webhook messages
 */
exports.handleWATIWebhook = async (req, res, next) => {
  try {
    const { eventType, data } = req.body;
    
    console.log('WATI Webhook received:', { eventType, data });

    // Handle different event types
    switch (eventType) {
      case 'message_received':
        await handleMessageReceived(data);
        break;
      case 'contact_created':
        await handleContactCreated(data);
        break;
      default:
        console.log('Unhandled WATI event type:', eventType);
    }

    return res.json({
      status: 200,
      message: 'Webhook processed successfully'
    });
  } catch (error) {
    console.error('WATI Webhook Error:', error);
    return next(error);
  }
};

/**
 * Handle incoming messages and provide pricing
 */
async function handleMessageReceived(data) {
  try {
    const { waId, senderName, messageContact, messageBody, timestamp } = data;
    
    // Store the message lead
    const messageLead = await prisma.wati_message_leads.create({
      data: {
        wati_id: data.id || null,
        wati_created: data.created || null,
        wati_type: data.type || null,
        source_id: data.sourceId || null,
        source_url: data.sourceUrl || null,
        wati_timestamp: timestamp || null,
        event_type: 'message_received',
        status_string: data.status || null,
        waId: waId,
        messageContact: messageContact,
        senderName: senderName,
        meta_data: data,
        is_sell_lead: false
      }
    });

    // Process the message using automation service
    const result = await watiAutomationService.processIncomingMessage({
      waId,
      messageBody,
      senderName
    });

    // Update message lead based on result
    if (result.type === 'pricing_success') {
      await prisma.wati_message_leads.update({
        where: { id: messageLead.id },
        data: { is_sell_lead: true }
      });
    }

  } catch (error) {
    console.error('Error handling message received:', error);
  }
}

/**
 * Handle contact creation
 */
async function handleContactCreated(data) {
  try {
    await prisma.wati_contacts.create({
      data: {
        event_type: 'contact_created',
        wati_id: data.id || null,
        wati_created: data.created || null,
        wa_id: data.waId || null,
        sender_name: data.senderName || null,
        source_id: data.sourceId || null,
        source_url: data.sourceUrl || null,
        source_type: data.sourceType || null,
        meta_data: data
      }
    });
  } catch (error) {
    console.error('Error handling contact created:', error);
  }
}



/**
 * Get WATI message leads
 */
exports.getWATIMessageLeads = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, is_sell_lead } = req.query;
    const offset = (page - 1) * limit;

    const whereClause = {};
    if (is_sell_lead !== undefined) {
      whereClause.is_sell_lead = is_sell_lead === 'true';
    }

    const leads = await prisma.wati_message_leads.findMany({
      where: whereClause,
      orderBy: { created_at: 'desc' },
      skip: offset,
      take: parseInt(limit)
    });

    const total = await prisma.wati_message_leads.count({
      where: whereClause
    });

    return res.json({
      status: 200,
      data: {
        leads,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * Get WATI contacts
 */
exports.getWATIContacts = async (req, res, next) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    const contacts = await prisma.wati_contacts.findMany({
      orderBy: { created_at: 'desc' },
      skip: offset,
      take: parseInt(limit)
    });

    const total = await prisma.wati_contacts.count();

    return res.json({
      status: 200,
      data: {
        contacts,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * Calculate WATI Price - New endpoint for WATI pricing
 */
exports.calculateWATIPrice = async (req, res, next) => {
  try {
    // Read data from headers
    const makeModel = req.headers['x-makemodel'] || req.headers['x-make-model'];
    const variant = req.headers['x-variant'];
    const type = req.headers['x-type'] || 'bike';
    const km = parseInt(req.headers['x-km']);
    const year = parseInt(req.headers['x-year']);
    const owner = parseInt(req.headers['x-owner']);

    // Validate required fields
    if (!makeModel || !variant || !km || !year || !owner) {
      return res.status(400).json({
        status: 400,
        message: 'Missing required fields. Please provide: makeModel, variant, km, year, owner in headers'
      });
    }

    // Validate data ranges
    if (km > 65000) {
      return res.status(400).json({
        status: 400,
        message: 'Km range doesnt fit vutto criteria'
      });
    }

    if (year <= 2014) {
      return res.status(400).json({
        status: 400,
        message: 'Year can not be less than 2015'
      });
    }

    // Call your existing pricing service
    const { calculateUsedPrices } = require('../services/engine.service');
    
    const pricingData = {
      makeModel,
      variant,
      type,
      km,
      year,
      owner
    };

    const result = await calculateUsedPrices(pricingData);
    
    return res.json({
      status: 200,
      message: 'Price calculated successfully',
      data: result
    });

  } catch (error) {
    console.error('WATI Pricing Error:', error);
    return res.status(500).json({
      status: 500,
      message: 'Internal server error',
      error: error.message
    });
  }
};
