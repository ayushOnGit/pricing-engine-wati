/* This code snippet defines an `AppsheetProvider` object that contains two asynchronous functions:
`addRow` and `findRow`. */

const axios = require('axios');

const AppsheetProvider = {
/* The `addRow` function in the `AppsheetProvider` object is an asynchronous function that sends a POST
request to add rows to a table in an AppSheet application. Here's a breakdown of what it does: */
  addRow: async (dataArray, tableName, appId, appAccessKey) => {
    try {
      let data = JSON.stringify({
        "Action": "Add",
        "Properties": {
          "Locale": "en-IN",
          "Timezone": "India Standard Time"
        },
        "Rows": dataArray
      });
      let config = {
        method: 'post',
        maxBodyLength: Infinity,
        url: `https://www.appsheet.com/api/v2/apps/${appId}/tables/${tableName}/Action?applicationAccessKey=${appAccessKey}`,
        headers: {
          'Content-Type': 'application/json'
        },
        data: data
      };


      const resp = await axios.request(config)
      return resp
    } catch (e) {
      console.log(e)
      return e
    }
  },
/* The `findRow` function in the `AppsheetProvider` object is an asynchronous function that sends a
POST request to find rows in a table in an AppSheet application based on a specific query. Here's a
breakdown of what it does: */
  findRow: async (selectRowsQuery, tableName, appId, appAccessKey) => {
    try {
      let data = JSON.stringify({
        "Action": "Find",
        "Properties": {
          "Locale": "en-IN",
          "Timezone": "India Standard Time"
        },

        "Rows": selectRowsQuery
      });
      let config = {
        method: 'post',
        maxBodyLength: Infinity,
        url: `https://www.appsheet.com/api/v2/apps/${appId}/tables/${tableName}/Action?applicationAccessKey=${appAccessKey}`,
        headers: {
          'Content-Type': 'application/json'
        },
        data: data
      };


      const resp = await axios.request(config)
      return resp.data
    } catch (e) {
      console.log(e)
      return e
    }
  },
  updateRow: async (updateRowsQuery, tableName, appId, appAccessKey) => {
    try {
      let data = JSON.stringify({
        "Action": "Edit",
        "Properties": {
          "Locale": "en-IN",
          "Timezone": "India Standard Time"
        },

        "Rows": updateRowsQuery
      });
      let config = {
        method: 'post',
        maxBodyLength: Infinity,
        url: `https://www.appsheet.com/api/v2/apps/${appId}/tables/${tableName}/Action?applicationAccessKey=${appAccessKey}`,
        headers: {
          'Content-Type': 'application/json'
        },
        data: data
      };

      const resp = await axios.request(config)
      return resp.data
    } catch (e) {
      console.log(e)
      return e
    }
  }
}



module.exports = {AppsheetProvider}