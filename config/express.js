const express = require('express');
const bodyParser = require('body-parser');
const compress = require('compression');
const cors = require('cors');
const helmet = require('helmet');
const routes = require('../api/routes');
const error = require('../api/middlewares/error');
const { requestLogger, errorLogger } = require('../api/middlewares/requestLogger');
const multer = require('multer');
const upload = multer({ dest: 'uploads/', storage: multer.memoryStorage() })

/**
* Express instance
* @public
*/
const app = express();

// Trust proxy (important for getting real IP behind nginx)
app.set('trust proxy', true);

// Request logging middleware (should be first)
app.use(requestLogger);

app.use(upload.single('file'))

// parse body params and attach them to req.body
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true }));

// gzip compression
app.use(compress());

// secure apps by setting various HTTP headers
app.use(helmet());

// enable CORS - Cross Origin Resource Sharing
app.use(cors());

// mount api v1 routes
app.use(routes);


app.use(error.validationError);

// if error is not an instanceOf APIError, convert it.
app.use(error.converter);

// catch 404 and forward to error handler
app.use(error.notFound);

// Error logging middleware
app.use(errorLogger);

// error handler, send stacktrace only during development
app.use(error.handler);

module.exports = app;
