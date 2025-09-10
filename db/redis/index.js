const redis = require('async-redis');

const client = redis.createClient({
  host: process.env.REDIS_HOST,
  port: process.env.REDIS_PORT,
  url: process.env.REDIS_URL,
  user: process.env.REDIS_USER,
  password: process.env.REDIS_PASSWORD,
  tls: {},
});

client.on('error', (error) => {
  // eslint-disable-next-line no-console
  console.error(`REDIS ERROR ::  ${error}`);
});

module.exports = client;
