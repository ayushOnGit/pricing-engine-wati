const express = require('express');

const router = express.Router();
const { celebrate: validate } = require('celebrate');

const controller = require('../controllers/engine');

const validations = require('../validations/engine.validation.js');

router
  .route('/bike/list')
  .get(
    // validate(validations.send, { allowUnknown: true }),
    controller.getBikeData,
  );

  router
  .route('/bike/used-price')
  .post(
    controller.calculateUsedBikePrice,
  );

  router
  .route('/feedback')
  .post(
    controller.recordFeedback,
  );

  router
  .route('/margin/all')
  .get(
    controller.getAllMargins,
  );

  router
  .route('/margin/update')
  .post(
    
    controller.updateMargin,
  );

  router
  .route('/bike/features')
  .post(
    controller.getVariantFeatures,
  );

  
  router
  .route('/margin/file')
  .post(
    controller.updateMarginFile,
  );

  router
  .route('/margin/file')
  .get(
    controller.downloadMarginFile,
  );

  router
  .route('/cluster/file')
  .post(
    controller.updateVehicleClusterInfo,
  );

  router
  .route('/cluster/file')
  .get(
    controller.downloadClusterInfoFile,
  );

  

  router
  .route('/variation/analyse')
  .get(
    controller.analyse,
  );

  router
  .route('/variant/identify')
  .post(
    controller.identifyVariant,
  );


  router
  .route('/variant/options')
  .get(
    controller.getModelFeatureOptions,
  );

  router
  .route('/bike/inventory')
  .get(
    controller.getActiveModelInventory,
  );

  router
  .route('/variant/feedback')
  .post(
    controller.variantIdentificationFeedback,
  );

  router
  .route('/model/warnings')
  .get(
    controller.checkModelWarnings,
  );
  

  router
  .route('/year/warnings')
  .get(
    controller.checkModelYearWarnings,
  );

  router
  .route('/model/pace')
  .get(
    controller.fetchModelPace,
  );

  router
  .route('/user/role')
  .get(
    controller.fetchAllowedActions,
  );

  // Get all brands for WATI dynamic lists
  router
  .route('/brands')
  .get(
    controller.getBrands,
  );

module.exports = router;

