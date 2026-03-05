const express = require('express');
const path = require('path');

const indexRouter = require('./routes/index');
const funnelsRouter = require('./routes/funnels');
const staticRouter = require('./routes/static');
const healthRouter = require('./routes/health');

const app = express();

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(require('express-ejs-layouts'));

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(require('cookie-parser')());

if (process.env.NODE_ENV !== 'production') {
  app.use(require('morgan')('dev'));
}

// Static assets
const projectRoot = path.join(__dirname, '..');
app.use('/assets', express.static(path.join(projectRoot, 'public', 'assets')));

// Routes
app.use('/', indexRouter);
app.use('/funnels', funnelsRouter);
app.use('/', staticRouter);
app.use('/', healthRouter);

module.exports = app;
