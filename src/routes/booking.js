const express = require('express');

const router = express.Router();

router.get('/rezervacia/', (req, res) => {
  res.render('booking', {
    layout: 'layouts/default',
    title: 'Rezervácia termínu – citimtedasom.sk',
    description: 'Rezervuj si termín na rodinné konstelácie.',
    extraStyles: '',
    extraScripts: `
      <script src="/assets/js/booking.js"></script>
    `,
  });
});

module.exports = router;
