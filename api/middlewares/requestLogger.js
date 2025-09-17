const winston = require('winston');
const moment = require('moment');

// Create logger instance
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss'
    }),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'pricing-engine' },
  transports: [
    // Write all logs with importance level of `error` or less to `error.log`
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    // Write all logs with importance level of `info` or less to `combined.log`
    new winston.transports.File({ filename: 'logs/combined.log' }),
    // Also log to console in development
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ],
});

// Request logging middleware
const requestLogger = (req, res, next) => {
  const startTime = Date.now();
  const timestamp = moment().format('YYYY-MM-DD HH:mm:ss');
  
  // Log incoming request
  const requestInfo = {
    timestamp,
    method: req.method,
    url: req.url,
    path: req.path,
    query: req.query,
    headers: {
      'user-agent': req.headers['user-agent'],
      'content-type': req.headers['content-type'],
      'authorization': req.headers['authorization'] ? 'Bearer [REDACTED]' : undefined,
      'x-real-ip': req.headers['x-real-ip'],
      'x-forwarded-for': req.headers['x-forwarded-for'],
      'host': req.headers['host']
    },
    body: req.body,
    ip: req.ip || req.connection.remoteAddress
  };

  // Log the request
  logger.info('Incoming Request', requestInfo);
  console.log(`\n🚀 [${timestamp}] ${req.method} ${req.url}`);
  console.log(`📍 IP: ${req.ip || req.connection.remoteAddress}`);
  console.log(`📝 Body:`, JSON.stringify(req.body, null, 2));
  console.log(`📋 Headers:`, JSON.stringify(requestInfo.headers, null, 2));

  // Override res.end to log response
  const originalEnd = res.end;
  res.end = function(chunk, encoding) {
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    // Log response
    const responseInfo = {
      timestamp: moment().format('YYYY-MM-DD HH:mm:ss'),
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      responseSize: chunk ? chunk.length : 0,
      ip: req.ip || req.connection.remoteAddress
    };

    // Log the response
    logger.info('Outgoing Response', responseInfo);
    console.log(`\n✅ [${moment().format('YYYY-MM-DD HH:mm:ss')}] ${req.method} ${req.url} - ${res.statusCode} (${duration}ms)`);
    console.log(`📊 Response Size: ${chunk ? chunk.length : 0} bytes`);
    console.log(`⏱️  Duration: ${duration}ms`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    // Call original end method
    originalEnd.call(this, chunk, encoding);
  };

  next();
};

// Error logging middleware
const errorLogger = (err, req, res, next) => {
  const timestamp = moment().format('YYYY-MM-DD HH:mm:ss');
  
  const errorInfo = {
    timestamp,
    method: req.method,
    url: req.url,
    error: {
      message: err.message,
      stack: err.stack,
      status: err.status || 500
    },
    ip: req.ip || req.connection.remoteAddress
  };

  // Log error
  logger.error('Request Error', errorInfo);
  console.log(`\n❌ [${timestamp}] ERROR - ${req.method} ${req.url}`);
  console.log(`🔴 Status: ${err.status || 500}`);
  console.log(`📝 Error: ${err.message}`);
  console.log(`📋 Stack: ${err.stack}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

  next(err);
};

module.exports = {
  requestLogger,
  errorLogger,
  logger
};
