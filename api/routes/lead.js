const express = require('express');
const router = express.Router();
const controller = require('../controllers/lead');

router
  .route('/supply/config')
  .get(
    controller.getSupplyUiConfig,
  );

  router
  .route('/supply/submit')
  .post(
    controller.submitSupplyLead,
  );
  

module.exports = router;

