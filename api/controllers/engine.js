

const prisma = require("../../db/prisma/prisma");
const { formatBikeData, calculateUsedBikePrice, calculatePricePostMargin, calculateFeatureDepreciation, readOnDiskBikeData, calculateUsedPrices, checkModelWarnings, checkModelYearWarnings, fetchModelPace, getNewBikePrice } = require("../services/engine.service");
const APIError = require('../utils/APIError');
const { VEHICLE_TYPES } = require("../utils/enums");
const _ = require('lodash');
const { convertJsonToCsv, convertCsvToJson, flattenObject, convertCsvStringToJson } = require("../utils/helper");
const fs = require('fs');
const path = require('path')


exports.getBikeData = async (req, res, next) => {
  try {

    const data = await prisma.bike_features.findMany({
      select: {
        id: true,
        model_name: true,
        variant_name: true,
        brand_name: true,
        price: true,
        pace: true,
        linked_variant_id: true,
        linked_variant_price_diff: true,
        price_reduction: true,
        is_active: true,
      },
      where: {
        is_active: true,
      }
    })

    const formattedBikeData = await formatBikeData(data);

    return res.json({
      status: 200,
      message: 'Bikes sent successfully',
      formattedBikeData,
    });
  } catch (error) {
    return next(error);
  }
};

const getKeyFeatureObject = (bike) => {
  let formattedFeatures = {}
  Object.keys(bike?.features || []).map((key) => {
    formattedFeatures = { ...formattedFeatures, ...bike?.features?.[key] }
  })
  Object.keys(bike?.specifications || []).map((key) => {
    formattedFeatures = { ...formattedFeatures, ...bike?.specifications?.[key] }
  })
  const shortlistedFeatures = ['abs', 'startType', 'wheelType', 'fuelSystem', "rearBrakeType", "frontBrakeType"]
  const keyFeatures = _.pick(formattedFeatures, shortlistedFeatures)
  return keyFeatures
}

exports.getVariantFeatures = async (req, res, next) => {
  try {
    const { makeModel, variant } = req.body
    const bike = await prisma.$queryRaw`
      SELECT * FROM bike_features
      WHERE CONCAT(brand_name, ' ', model_name) LIKE ${'%' + makeModel + '%'} and variant_name =  ${variant}
    `
    const keyFeatures = getKeyFeatureObject(bike?.[0])
    return res.json({
      status: 200,
      message: 'Bikes sent successfully',
      features: keyFeatures,
      vehicleType: bike?.[0]?.vehicle_type
    });
  } catch (error) {
    return next(error);
  }
};

exports.calculateUsedBikePrice = async (req, res, next) => {
  try {
    const { makeModel, variant, type, km, year, month = 1, owner, refurbCost, refurbCostPercent, onRoadPrice, vehicleRegistration, customFeature, augmentRange } = req.body;
    if (km > 65000) {
      throw new APIError({
        message: 'Km range doesnt fit vutto criteria',
        status: 400
      })
    }
    if (year <= 2014) {
      throw new APIError({
        message: 'Year can not be less than 2015',
        status: 400
      })
    }

    let result;

    if (!variant) {
      const bikesData = await prisma.$queryRaw`SELECT * FROM bike_features WHERE CONCAT(brand_name, ' ', model_name) = ${makeModel} order by price desc`
      const prices = [];
      for (let bike of bikesData) {
        if (bike?.pace == 'EXTREMELY SLOW') continue;
        const priceItem = await calculateUsedPrices({ makeModel: bike.brand_name + " " + bike.model_name, variant: bike.variant_name, type, km, year, month, owner, refurbCost, refurbCostPercent, onRoadPrice })
        prices.push(priceItem)
      }

      const procurementPrices = prices.map((priceItem) => {
        const { newPrice, usedPrice, postMarginCalculation } = priceItem
        const { isMarginRangeSet, procurementPrice, procurementPriceMinRange } = postMarginCalculation
        return procurementPrice;
      })

      const minProcPrice = procurementPrices.length == 1 ? Math.ceil(Math.min(...procurementPrices) * .9) : Math.ceil(Math.min(...procurementPrices) * .95)
      const maxProcPrice = procurementPrices.length == 1 ? Math.ceil(Math.max(...procurementPrices) * 1.1) : Math.max(...procurementPrices)
      result = {
        isMarginRangeSet: procurementPrices.length > 0,
        procurementPrice: Math.max(...procurementPrices),
        procurementPriceMinRange: minProcPrice,
        procurementPriceMaxRange: maxProcPrice,
      }
    } else {
      const { usedPrice, newPrice, postMarginCalculation, postMarkupCalculation, userPriceSupply } = await calculateUsedPrices({ makeModel, variant, type, km, year, month, owner, refurbCost, refurbCostPercent, onRoadPrice, vehicleRegistration, customFeature })
      result = {
        usedPrice,
        userPriceSupply,
        newPrice,
        percent_depreciation: parseInt((newPrice - usedPrice) * 10000 / newPrice) / 100,
        ...postMarginCalculation,
        ...postMarkupCalculation,
      }
    }

    if (augmentRange) {
      result = {
        isMarginRangeSet: result?.isMarginRangeSet,
        procurementPrice: result?.procurementPrice,
        procurementPriceMaxRange: result?.procurementPriceMaxRange,
        procurementPriceMinRange: result?.procurementPriceMinRange,
      }
    }

    return res.json({
      status: 200,
      message: 'Price calculated & sent successfully',
      data: result
    });
  } catch (error) {
    return next(error);
  }
};


exports.recordFeedback = async (req, res, next) => {
  try {
    const { selectedMake, selectedVariant, onRoadPrice, owner, km, priceData, year, type, demandQuote, procurementQuote, vehicleRegistration, refurbCost, sentiment, bikeExists, features, email } = req.body
    const feedbackEntry = await prisma.pricing_engine_feedback.create({
      data: {
        selected_make: selectedMake,
        selected_variant: selectedVariant,
        on_road_price: parseFloat(priceData?.newPrice),
        owner: parseInt(owner) - 1,
        km: parseInt(km),
        vutto_price: priceData?.vuttoPrice,
        procurement_price: priceData?.procurementPrice,
        depreciation_percent: priceData?.depreciationPercent,
        year: parseInt(year),
        type,
        ...(demandQuote && { quote: parseInt(demandQuote) }),
        ...(procurementQuote && { procurement_quote: parseInt(procurementQuote) }),
        vehicle_registration: vehicleRegistration || '',
        refurb_cost: parseFloat(refurbCost),
        sentiment,
        bike_exists: bikeExists,
        features,
        email
      }
    })

    return res.json({
      status: 200,
      message: 'Feedback recorded successfully',
    });
  } catch (error) {
    return next(error);
  }
};


exports.getAllMargins = async (req, res, next) => {
  try {
    const marginConfig = await prisma.config.findFirst({
      where: {
        config_key: 'VUTTO_MARGINS'
      }
    })

    if (!marginConfig) {
      throw new APIError({
        message: 'Margins not found',
        status: 404
      })
    }

    return res.json({
      status: 200,
      message: 'Margins fetched successfully',
      data: marginConfig.value
    });
  } catch (error) {
    return next(error);
  }
}

exports.updateMargin = async (req, res, next) => {
  try {
    const { vehicleType, updatedMargins } = req.body;
    let normalizedVehicleType = vehicleType.toLowerCase();
    if (!Object.values(VEHICLE_TYPES).includes(normalizedVehicleType)) {
      throw new APIError({
        message: 'Vehicle type not found',
        status: 404
      })
    }

    const marginConfig = await prisma.config.findFirst({
      where: {
        config_key: 'VUTTO_MARGINS'
      }
    })

    if (!marginConfig) {
      throw new APIError({
        message: 'Margins not found',
        status: 404
      })
    }

    marginConfig.value[normalizedVehicleType?.toLowerCase()] = updatedMargins

    await prisma.config.update({
      data: { value: marginConfig.value },
      where: { id: marginConfig.id }
    })

    return res.json({
      status: 200,
      message: 'Margins updated successfully',
    });
  } catch (error) {
    return next(error);
  }
}


exports.downloadMarginFile = async (req, res, next) => {
  try {
    // Get JSON data from the request body
    const jsonData = await prisma.config.findFirst({
      where: {
        config_key: 'VUTTO_MARGINS'
      }
    })

    const csv = await convertJsonToCsv(jsonData.value)
    // Define a CSV file path
    const filePath = path.join(__dirname, 'margins.csv');

    // Write CSV to a file
    fs.writeFile(filePath, csv, (err) => {
      if (err) {
        console.error('Error writing CSV file', err);
        return res.status(500).send('Error writing CSV file');
      }

      // Send the CSV file as a response
      res.download(filePath, 'data.csv', (err) => {
        if (err) {
          console.error('Error sending file', err);
          return res.status(500).send('Error sending file');
        }

        // Optionally, delete the file after sending it
        fs.unlink(filePath, (err) => {
          if (err) console.error('Error deleting file', err);
        });
      });
    });

  } catch (error) {
    return next(error);
  }
}

exports.updateMarginFile = async (req, res, next) => {
  try {
    const file = req.file;
    const jsonMargins = await convertCsvStringToJson(file.buffer.toString('utf-8'))
    const marginConfig = await prisma.config.findFirst({
      where: {
        config_key: 'VUTTO_MARGINS'
      }
    })

    await prisma.config.update({
      data: {
        value: jsonMargins
      },
      where: {
        id: marginConfig.id
      }
    })

    return res.json({
      status: 200,
      message: 'Margins updated successfully',
    });
  } catch (error) {
    return next(error);
  }
}

exports.updateVehicleClusterInfo = async (req, res, next) => {
  try {
    const file = req.file;
    const jsobData = await convertCsvStringToJson(file.buffer.toString('utf-8'))
    for (let bike of jsobData) {
      const dbBike = await prisma.bike_features.findFirst({
        where: {
          brand_name: bike?.['Brand name'],
          model_name: bike?.['Model name'],
          variant_name: bike?.['Variant name'],
        }
      });
      // check if bike exists
      if (dbBike) {
        // check or create cluster if non existent
        let dbCluster = await prisma.bike_feature_cluster.findFirst({
          where: {
            name: bike?.['Cluster'],
          }
        })
        if (!dbCluster) {
          dbCluster = await prisma.bike_feature_cluster.create({
            data: {
              max_allowed_inventory: 0,
              name: bike?.['Cluster'],
            }
          })
        }

        await prisma.bike_features.update({
          where: {
            id: dbBike?.id,
          },
          data: {
            max_allowed_year: parseInt(bike?.['Year Max']) || dbBike?.max_allowed_year,
            min_allowed_year: parseInt(bike?.['Year Min']) || dbBike?.min_allowed_year,
            pace: bike?.['Pace'] || dbBike?.pace,
            supply_demand_factor_consecutive: parseFloat(bike?.['Supply demand factor consecutive']) || dbBike?.supply_demand_factor_consecutive,
            supply_demand_factor_first: parseFloat(bike?.['Supply demand factor first']) || dbBike?.supply_demand_factor_first,
            bike_feature_cluster_id: dbCluster?.id || dbBike?.bike_feature_cluster_id

          }
        })
      }
    }

    return res.json({
      status: 200,
      message: 'Bikes and Clusters updated successfully',
    });
  } catch (error) {
    return next(error);
  }
}


exports.downloadClusterInfoFile = async (req, res, next) => {
  try {
    // Get JSON data from the request body
    const jsonData = await prisma.$queryRaw`SELECT 
    bike_features.id as "ID",
    bike_features.brand_name as "Brand name",
    bike_features.model_name as "Model name",
    bike_features.variant_name as "Variant name",
    bike_features.fuel as "Fuel",
    bike_features.pace as "Pace",
    bike_features.price as "Price",
    bike_features.price_reduction as "Price reduction",
    bike_features.supply_demand_factor_consecutive as "Supply demand factor consecutive",
    bike_features.supply_demand_factor_first as "Supply demand factor first",
    bike_features.vehicle_type as "Vehicle type",
    bike_features.max_allowed_year as "Year Max",
    bike_features.min_allowed_year as "Year Min",
    bike_feature_cluster.name as "Cluster"
     FROM bike_features left join bike_feature_cluster on bike_features.bike_feature_cluster_id=bike_feature_cluster.id `

    const csv = await convertJsonToCsv(jsonData)
    // Define a CSV file path
    const filePath = path.join(__dirname, 'clusters.csv');

    // Write CSV to a file
    fs.writeFile(filePath, csv, (err) => {
      if (err) {
        console.error('Error writing CSV file', err);
        return res.status(500).send('Error writing CSV file');
      }

      // Send the CSV file as a response
      res.download(filePath, 'data.csv', (err) => {
        if (err) {
          console.error('Error sending file', err);
          return res.status(500).send('Error sending file');
        }

        // Optionally, delete the file after sending it
        fs.unlink(filePath, (err) => {
          if (err) console.error('Error deleting file', err);
        });
      });
    });

  } catch (error) {
    return next(error);
  }
}


const cleanValue = (value) => {
  if (value == undefined || value == null || value == 'null' || value == 'undefined' || value == 'na')
    return ''
  return value + ''
}

exports.identifyVariant = async (req, res, next) => {
  try {
    const { makeModel, featureData } = req.body
    const bikes = await prisma.$queryRaw`SELECT * FROM bike_features WHERE CONCAT(brand_name, ' ', model_name) ILIKE ${makeModel}`
    if (!(bikes.length > 0)) {
      throw new APIError({
        message: 'Bike not found',
        status: 404
      })
    }
    const featureOrder = ['technology.gpsNavigation', 'additionalFeatures.ridingModes', 'comfortConvinience.startType', 'safety.abs', 'safety.ledLights', 'instrumentCluster.odometer', 'instrumentCluster.speedometer', 'brakesWheels.rearBrakeType', 'brakesWheels.frontBrakeType', 'brakesWheels.wheelType']
    let filteredArray = bikes
    for (let feature of featureOrder) {
      if (filteredArray.length > 1) {
        let tempfilteredArray = filteredArray.filter((bike) => {
          const flatFeatures = { ...flattenObject(bike.features), ...flattenObject(bike.specifications) }
          return cleanValue(featureData[feature]).toLowerCase() == cleanValue(flatFeatures[feature]).toLowerCase()
        })
        if (tempfilteredArray.length == 0) break
        filteredArray = tempfilteredArray
      }
    }

    if (filteredArray.length == 0) {
      throw new APIError({
        message: 'Something went wrong.',
        status: 400
      })
    }

    filteredArray = filteredArray.sort((b1, b2) => {
      return b1.price - b2.price
    })

    return res.json({
      status: 200,
      message: 'Fetched variants',
      possibleVariant: _.pick(filteredArray[0], ['brand_name', 'model_name', 'variant_name'])
    });
  } catch (error) {
    return next(error);
  }
}


const analyseModelCluster = (variants) => {
  const featureOrder = ['technology.gpsNavigation', 'additionalFeatures.ridingModes', 'comfortConvinience.startType', 'safety.abs', 'safety.ledLights', 'instrumentCluster.odometer', 'instrumentCluster.speedometer', 'brakesWheels.rearBrakeType', 'brakesWheels.frontBrakeType', 'brakesWheels.wheelType']
  const variation = {}
  for (let variant of variants) {
    let key = ''
    let varFeatObj = { ...flattenObject(variant.features), ...flattenObject(variant.specifications) }
    for (let feat of featureOrder)
      key +=
        feat + ':' +
        cleanValue(varFeatObj[feat]) + ' '
    if (!variation[key]) {
      variation[key] = []
    }
    variation[key].push(variant)
  }
  let result = []
  for (let key of Object.keys(variation)) {
    result.push(variation[key].length)
  }
  console.log(variation)
  return result
}

exports.analyse = async (req, res, next) => {
  try {
    const bikes = await prisma.bike_features.findMany({})

    //clustered bikes
    const cluster = {}
    for (let bike of bikes) {
      if (!cluster[bike.brand_name + " " + bike.model_name])
        cluster[bike.brand_name + " " + bike.model_name] = []
      cluster[bike.brand_name + " " + bike.model_name].push(bike)
    }

    // make cluster
    // check model wise pnc of all feature values in 
    let varitionObj = {}
    for (let bikeModel of Object.keys(cluster)) {
      if (cluster[bikeModel].length > 3)
        varitionObj[bikeModel] = analyseModelCluster(cluster[bikeModel])
    }

    return res.json({
      status: 200,
      message: 'Fetched variants',
      possibleVariants: varitionObj
    });
  } catch (error) {
    return next(error);
  }
}



exports.getModelFeatureOptions = async (req, res, next) => {
  try {
    const { makeModel } = req.query
    const bikes = await prisma.$queryRaw`SELECT * FROM bike_features WHERE CONCAT(brand_name, ' ', model_name) ILIKE ${makeModel}`
    if (!(bikes.length > 0)) {
      throw new APIError({
        message: 'Bike not found',
        status: 404
      })
    }

    const differentiationRequired = bikes?.length > 1
    const featureOptions = {}

    if (differentiationRequired) {
      const featureOrder = ['technology.gpsNavigation', 'additionalFeatures.ridingModes', 'comfortConvinience.startType', 'safety.abs', 'safety.ledLights', 'instrumentCluster.odometer', 'instrumentCluster.speedometer', 'brakesWheels.rearBrakeType', 'brakesWheels.frontBrakeType', 'brakesWheels.wheelType']
      for (let bike of bikes) {
        const bikeFeats = { ...flattenObject(bike.features), ...flattenObject(bike.specifications) }
        for (let feat of featureOrder) {
          if (!featureOptions[feat])
            featureOptions[feat] = new Set()
          featureOptions[feat].add(cleanValue(bikeFeats[feat]))
        }
      }

      for (let feat of featureOrder) {
        featureOptions[feat] = Array.from(featureOptions[feat])
      }
    }


    return res.json({
      status: 200,
      message: 'Fetched variant options',
      differentiationRequired,
      featureOptions
    });
  } catch (error) {
    return next(error);
  }
}

exports.getActiveModelInventory = async (req, res, next) => {
  try {
    const { makeModel } = req.query
    const bikes = await prisma.$queryRaw`SELECT * FROM bikes WHERE CONCAT(brand_name, ' ', model_name) ILIKE ${makeModel} AND status!='sold' and status!='delisted'`

    return res.json({
      status: 200,
      message: 'Fetched variant options',
      count: (bikes || []).length

    });
  } catch (error) {
    return next(error);
  }
}

exports.variantIdentificationFeedback = async (req, res, next) => {
  try {
    const { makeModel, suggestedVariant, sentiment, selectedFeatures, userEmail } = req.body
    await prisma.variant_identification_feedback.create({
      data: {
        selected_make: makeModel,
        sentiment: sentiment,
        suggested_variant: suggestedVariant,
        selected_features: selectedFeatures,
        user_email: userEmail,
      }
    })
    return res.json({
      status: 200,
      message: 'Feedback recorded'

    });
  } catch (error) {
    return next(error);
  }
}


exports.checkModelWarnings = async (req, res, next) => {
  try {
    const { makeModel } = req.query
    const data = await checkModelWarnings(makeModel)
    return res.json({
      status: 200,
      message: 'Data fetched successfully',
      data
    });

  }
  catch (e) {
    return next(e);
  }
}


exports.checkModelYearWarnings = async (req, res, next) => {
  try {
    const { makeModel, year } = req.query
    const data = await checkModelYearWarnings(makeModel, year)
    return res.json({
      status: 200,
      message: 'Data fetched successfully',
      data
    });

  }
  catch (e) {
    return next(e);
  }
}



exports.fetchModelPace = async (req, res, next) => {
  try {
    const { makeModel } = req.query
    const data = await fetchModelPace(makeModel)
    return res.json({
      status: 200,
      message: 'Data fetched successfully',
      data
    });

  }
  catch (e) {
    return next(e);
  }
}

exports.fetchAllowedActions = async (req, res, next) => {
  try {
    const { email } = req.query
    const roleConfig = await prisma.config.findFirst({
      where: {
        config_key: "CALCULATOR_ROLES"
      }
    })

    let data = [];
    for (let role of Object.keys(roleConfig?.value || {})) {
      if (roleConfig?.value[role].includes(email)) {
        data.push(role)
      }
    }

    return res.json({
      status: 200,
      message: 'Data fetched successfully',
      data
    });

  }
  catch (e) {
    return next(e);
  }
}

// Get all brands for WATI dynamic lists
exports.getBrands = async (req, res, next) => {
  try {
    const brands = await prisma.$queryRaw`
      SELECT DISTINCT brand_name 
      FROM bike_features 
      ORDER BY brand_name
    `;
    
    return res.json({ 
      status: 200, 
      data: brands.map(b => b.brand_name) 
    });
  } catch (error) {
    return next(error);
  }
};

