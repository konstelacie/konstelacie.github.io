const express = require('express');
const { renderSiteHome } = require('./funnels');

const router = express.Router();

router.get('/', renderSiteHome);

module.exports = router;
