const express = require('express');

const router = express.Router();
const { celebrate: validate } = require('celebrate');

const controller = require('../controllers/refurb');



router
  .route('/video/upload')
  .post(
    controller.uploadRefurbVideo,
  );


module.exports = router;

