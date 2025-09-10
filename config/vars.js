// import .env variables
const path = require('path');
// import .env variables
require('dotenv-safe').config({
  path: path.join(__dirname, '../.env'),
});

module.exports = {
  env: process.env.NODE_ENV,
  port: process.env.PORT,
};
