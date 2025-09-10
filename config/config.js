require('dotenv-safe').config()
module.exports = {
  development: {
    username: process.env.DATABASE_USERNAME,
    password: process.env.DATABASE_PASSWORD,
    database: process.env.DATABASE_NAME,
    host: process.env.DATABASE_HOST_URL,
    dialect: 'postgres',
    logging: true,
    timezone: 'Asia/Calcutta',
  },
};