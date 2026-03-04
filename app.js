const express = require('express');
const path = require('path');

const indexRouter = require('./routes/index');
const funnelsRouter = require('./routes/funnels');
const staticRouter = require('./routes/static');

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(require('cookie-parser')());

if (process.env.NODE_ENV !== 'production') {
  app.use(require('morgan')('dev'));
}

// Static assets
app.use('/assets', express.static(path.join(__dirname, 'assets')));

// Routes
app.use('/', indexRouter);
app.use('/funnels', funnelsRouter);
app.use('/', staticRouter);

module.exports = app;
