/* eslint-disable comma-dangle */
/* eslint-disable quotes */
module.exports = {
  apps: [{
    name: "machine-coding",
    script: "current/index.js",
    instances: 2,
    exec_mode: "cluster"
  }]
};
