const express = require('express');
const router = express.Router();
const controller = require('../controllers/webhook');

router
  .route('/price/revise')
  .post(
    controller.createPriceRevisionRequests,
  );


module.exports = router;

