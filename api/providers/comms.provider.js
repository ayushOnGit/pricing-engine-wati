const { default: axios } = require("axios");

exports.CommsProvider = axios.create({baseURL: process.env.COMMS_ENGINE_URL})