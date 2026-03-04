const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Static assets
app.use('/assets', express.static(path.join(__dirname, 'assets')));

// Root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Funnels
app.get('/funnels/pilot/', (req, res) => {
  res.sendFile(path.join(__dirname, 'funnels', 'pilot', 'index.html'));
});

// Robots & sitemap
app.get('/robots.txt', (req, res) => {
  res.sendFile(path.join(__dirname, 'robots.txt'));
});
app.get('/sitemap.xml', (req, res) => {
  res.sendFile(path.join(__dirname, 'sitemap.xml'));
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
