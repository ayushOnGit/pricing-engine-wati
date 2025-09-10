const express = require('express');

const router = express.Router();
const controller = require('../controllers/revision');

router
  .route('/create/listing-request')
  .post(
    controller.createListingPriceRequest,
  );

  router
  .route('/update/status')
  .post(
    controller.changePriceRequestStatus,
  );

  router
  .route('/create/manual-request')
  .post(
    controller.createManualPriceRequest,
  );


  
module.exports = router;

