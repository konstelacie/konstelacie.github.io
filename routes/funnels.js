const express = require('express');
const path = require('path');

const router = express.Router();

router.get('/pilot/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'funnels', 'pilot', 'index.html'));
});

module.exports = router;
