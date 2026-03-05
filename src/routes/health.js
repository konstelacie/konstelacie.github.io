const express = require('express');
const db = require('../db');

const router = express.Router();

router.get('/health', async (_req, res) => {
  const result = await db.healthCheck();
  const statusCode = result.ok ? 200 : 503;
  res.status(statusCode).json(result);
});

module.exports = router;
