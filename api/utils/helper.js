const fs = require('fs');
const csv = require('csv-parser');
const { Parser } = require('json2csv');
const path = require('path');
const { Readable } = require('stream');
const _ = require('lodash');
const moment = require('moment');
const { sendEmail } = require('../services/external/commsEngine');

exports.paginate = (page = 1, pageSize = 10) => {
  const offset = (page - 1) * pageSize;
  const limit = pageSize;

  return {
    offset,
    limit,
  };
};

exports.convertCsvToJson = async (csvFilePath) => {
  return await new Promise((resolve, reject) => {
    const results = [];

    fs.createReadStream(csvFilePath)
      .pipe(csv())
      .on('data', (data) => results.push(data))
      .on('end', () => {
        resolve(results);
      })
      .on('error', (error) => {
        reject(error);
      });
  });
};


exports.convertCsvStringToJson = async (csvString) => {
  // Convert the CSV string into a readable stream
  const stream = Readable.from([csvString]);
  // Array to store the parsed JSON data
  const results = [];
  stream
    .pipe(csv())
    .on('data', (data) => results.push(data))
    .on('end', () => {
      return results;
    })
    .on('error', (err) => {
      console.error('Error parsing CSV:', err);
    });

  return results
}


exports.saveDataLocally = async (filename, data) => {
  const filePath = `./resources/${filename}.json`
  fs.writeFileSync(filePath, JSON.stringify(data));
}

exports.convertJsonToCsv = async (jsonData) => {
  // Create a JSON to CSV parser
  const json2csvParser = new Parser();
  const csv = json2csvParser.parse(jsonData);
  return csv
}

exports.flattenObject = (obj, parentKey = '', result = {}) => {
  for (let key in obj) {
    // Construct the new key by combining the parent key with the current key
    const newKey = parentKey ? `${parentKey}.${key}` : key;

    // If the value is an object and not null, recurse
    if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
      this.flattenObject(obj[key], newKey, result);
    } else {
      // Otherwise, store the key-value pair in the result
      result[newKey] = obj[key];
    }
  }
  return result;
}

exports.parseQueryString = (queryString) => {
  const params = new URLSearchParams(queryString);
  const result = {};

  // Iterate through all key-value pairs and build a JSON object
  params.forEach((value, key) => {
    result[key] = value;
  });

  return result;
};



exports.createActivityLog = (user, oldValue, newValue) => {
  const keysEvents = eventMapper(oldValue, newValue)
  if (!oldValue) {
      return {
          changed_by_id: user.id,
          changed_by_name: user.name,
          new_value: newValue,
          event: keysEvents.events,
          at: moment().toString(),
      }
  }

  return {
      changed_by_id: user.id,
      changed_by_name: user.name,
      old_value: _.pick(oldValue, keysEvents.keys),
      new_value: _.pick(newValue, keysEvents.keys),
      event: keysEvents.events,
      at: moment().toString(),
  }

}


        
const findDifferingKeys = (obj1, obj2) => {
  const allKeys = _.union(_.keys(obj1), _.keys(obj2));
  return _.filter(allKeys, key => !_.isEqual(_.get(obj1, key), _.get(obj2, key)));
}

const eventMapper = (oldValue, newValue) => {
  if (!oldValue) {
      return {events:[GENERAL_EVENTS.CREATED]}
  }
  const objDiff = findDifferingKeys(oldValue, newValue)
  const excludeKeys= new Set(['id','status_updated_at','listed_at','created_at','updated_at','activity_logs'])
  const events = []
  const differingValidKeys = []
  objDiff.map((key) => {
      if(!excludeKeys.has(key)){
          events.push( `${key}_CHANGED`.toUpperCase())
          differingValidKeys.push(key)
      }
  })

  return {events,keys:differingValidKeys};

}



exports.sendPriceRevisionAlert = async (subject, body) => {

  const alertConfig = await prisma.config.findFirst({
    where: {
      config_key: "PRICE_REQUEST_ALERT_EMAILS"
    }
  })
  const alertEmails = alertConfig.value;
  await sendEmail('apoorv.goyal@vutto.in',alertEmails, subject, body);
}

exports.roundUp250 =  (number) => {
  return Math.ceil(number/250)*250
}


exports.roundDown250 =  (number) => {
  return Math.floor(number/250)*250
}
