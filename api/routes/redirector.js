const express = require('express');
const router = express.Router();
const controller = require('../controllers/redirector');

router
    .route('/create')
    .post(
        controller.createRedirectorLinksFromFile,
    );

router
    .route('/create/direct')
    .post(
        controller.createRedirectorLinks,
    );

router
    .route('/upsert/direct')
    .post(
        controller.createReplaceRedirectorLink,
    );
module.exports = router;

