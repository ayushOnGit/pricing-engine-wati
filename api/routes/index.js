const express = require('express');
const router = express.Router();
const engineRoute = require('./engine');
const refurbRoute = require('./refurb');
const revisionRoute = require('./revision');
const redirectorRoute = require('./redirector');
const webhookRoute = require('./webhook');
const leadRoute = require('./lead');
const watiRoute = require('./wati');

/**
 * GET /status
 */
router.get('/api/status', (req, res) => res.send('OK'));

router.use('/api/engine', engineRoute);
router.use('/api/refurb', refurbRoute);
router.use('/api/revision', revisionRoute);
router.use('/api/redirector', redirectorRoute);

router.use('/api/webhook', webhookRoute);
router.use('/api/lead', leadRoute);
router.use('/api/wati', watiRoute);


module.exports = router;
