const express = require('express');
const router = express.Router();
const controller = require('../controllers/wati');

// WATI webhook endpoint
router
  .route('/webhook')
  .post(controller.handleWATIWebhook);

// Get WATI message leads
router
  .route('/leads')
  .get(controller.getWATIMessageLeads);

// Get WATI contacts
router
  .route('/contacts')
  .get(controller.getWATIContacts);

// Calculate WATI price
router
  .route('/calculate-price')
  .post(controller.calculateWATIPrice);

module.exports = router;

