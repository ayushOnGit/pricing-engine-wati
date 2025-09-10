const prisma = require("../../db/prisma/prisma");
const { convertCsvToJson, roundUp250, roundDown250 } = require("../utils/helper")
const _ = require('lodash');
const APIError = require('../utils/APIError');
const moment = require("moment");
const { readData } = require("./external/googleSheets");

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

exports.getNewBikePrice = async (bike) => {
  if (bike?.linked_variant_id) {
    const linkedParentBike = await prisma.bike_features.findFirst({
      where: { id: bike?.linked_variant_id }
    })
    return ((await this.getNewBikePrice(linkedParentBike)) - (bike?.linked_variant_price_diff || 0))
  }
  return bike?.price- (bike?.price_reduction || 0)
}

const getNewBikePriceFromList = (bike, bikeList) => {
  if (bike?.linked_variant_id) {
    const linkedParentBike = bikeList.find((bikeVal) => bikeVal.id == bike?.linked_variant_id)
    return ((getNewBikePriceFromList(linkedParentBike, bikeList)) - (bike?.linked_variant_price_diff || 0))
  }
  return bike?.price
}

exports.getSdFactors = async (bike) => {
  let sdFactor = bike?.supply_demand_factor_first
  let supplyDemandFactorFirstConsecutive = bike?.supply_demand_factor_first_consecutive
  let sdFactorConsecutive = bike?.supply_demand_factor_consecutive
  let sdFactorLater = bike?.supply_demand_factor_later
  if (sdFactor && supplyDemandFactorFirstConsecutive && sdFactorConsecutive) {
    return { sdFactor, supplyDemandFactorFirstConsecutive, sdFactorConsecutive, sdFactorLater }
  } else if (bike?.linked_variant_id) {
    const linkedParentBike = await prisma.bike_features.findFirst({
      where: { id: bike?.linked_variant_id }
    })
    return await this.getSdFactors(linkedParentBike)
  }
  return { sdFactor, supplyDemandFactorFirstConsecutive, sdFactorConsecutive, sdFactorLater }

}

exports.calculateUsedPrices = async (data) => {
  const { makeModel, variant, type: externalType, km, year, month, owner, refurbCost, refurbCostPercent, onRoadPrice, customFeature, additionalParams, skipInventoryMarginInflation = false } = data

  let newPrice;
  let newPriceAdjusted;
  let sdFactor;
  let sdFactorConsecutive, supplyDemandFactorFirstConsecutive, sdFactorLater;
  let featureDepreciation = 1
  let fuel;
  let pace;
  let type;
  let markupAppreciationFactor=0;
  let proc_vsp_adjustment_factor;
  let min_proc_vsp_difference;
  if (makeModel && variant) {
    const bikesData = await prisma.$queryRaw`
    SELECT * FROM bike_features
    where CONCAT(brand_name, ' ', model_name) = ${makeModel} and variant_name = ${variant}`
    if (bikesData.length == 0) {
      throw new APIError({
        message: 'Bike not found',
        status: 404
      })
    }
    type = bikesData?.[0]?.vehicle_type || externalType
    markupAppreciationFactor= bikesData?.[0]?.markup_appreciation_factor || 0
    newPrice = parseInt(await this.getNewBikePrice(bikesData?.[0]))
    newPriceAdjusted = newPrice
    const sdFactors = await this.getSdFactors(bikesData?.[0])
    sdFactor = sdFactors?.sdFactor
    supplyDemandFactorFirstConsecutive = sdFactors?.supplyDemandFactorFirstConsecutive
    sdFactorConsecutive = sdFactors?.sdFactorConsecutive
    sdFactorLater= sdFactors?.sdFactorLater
    const keyFeatures = getKeyFeatureObject(bikesData?.[0])
    if (customFeature)
      featureDepreciation = this.calculateFeatureDepreciation(keyFeatures, customFeature)
    fuel = bikesData?.[0]?.fuel
    pace = bikesData?.[0]?.pace
    proc_vsp_adjustment_factor=bikesData?.[0]?.proc_vsp_adjustment_factor;
    min_proc_vsp_difference=bikesData?.[0]?.min_proc_vsp_difference;
  } else if (onRoadPrice) {
    type = externalType
    newPrice = onRoadPrice
    newPriceAdjusted = onRoadPrice
    sdFactor = 0
    sdFactorConsecutive = 0
  } else {
    throw new APIError({
      message: 'Either new bike price or the bike make and model are required',
      status: 404
    })
  }

  const usedPriceWithoutFeatDepreciation = await this.calculateUsedBikePrice(type?.toLowerCase(), km, year, month, newPriceAdjusted, owner, sdFactor, sdFactorConsecutive, supplyDemandFactorFirstConsecutive, sdFactorLater);
  const usedPrice = parseInt(featureDepreciation * usedPriceWithoutFeatDepreciation)
  const marginConfig = await prisma.config.findFirst({
    where: {
      config_key: 'VUTTO_MARGINS'
    }
  })
  const userPriceSupply = this.calculateUsedPriceSupply(usedPrice,proc_vsp_adjustment_factor,min_proc_vsp_difference)

  const postMarginCalculation = await this.calculatePricePostMargin(marginConfig?.value || [], userPriceSupply, refurbCost || (refurbCostPercent * usedPriceWithoutFeatDepreciation / 100) || 0, newPriceAdjusted, (fuel || '').toUpperCase(), (pace || '').toUpperCase(), makeModel, year, skipInventoryMarginInflation)
  const postMarkupCalculation = await this.calculatePricePostMarkup(marginConfig?.value || [], usedPrice, (fuel || '').toUpperCase(), (pace || '').toUpperCase(), additionalParams?.listingDate, postMarginCalculation?.marginValue, markupAppreciationFactor*usedPrice)

  return { newPrice, usedPrice, userPriceSupply, postMarginCalculation, postMarkupCalculation }

}

exports.calculateUsedPriceSupply = (vsp,proc_vsp_adjustment_factor,min_proc_vsp_difference)=>{
// Introduce a factor to create a new price point called Proc VSP by reducing the original VSP by a certain percent factor called proc_vsp_adjustment_factor defaults to 0
// Have a min_proc_vsp_difference value defaults to 1500
// These two above will be SKU level
// A third factor hardcoded will be max_proc_adjustment_value set to 10k
  let supply_vsp_factor = vsp * proc_vsp_adjustment_factor
  supply_vsp_factor=Math.max(supply_vsp_factor,min_proc_vsp_difference||1500);
  supply_vsp_factor=Math.min(supply_vsp_factor,10000);
  return Math.round(vsp - supply_vsp_factor);
}

exports.readOnDiskBikeData = async (filename) => {
  const bikeData = await convertCsvToJson(`./resources/${filename}.csv`);
  return bikeData
}

exports.formatBikeData = async (bikeData) => {
  const formattedData = []
  for (let bike of bikeData) {
    let price = getNewBikePriceFromList(bike, bikeData)
    formattedData.push({
      model: bike?.model_name,
      variant: bike?.variant_name,
      make: bike?.brand_name,
      price: price,
      pace: bike?.pace,
    })
  }
  return formattedData

}

/* The above code is a JavaScript function that calculates the used bike price based on various factors
such as type, kilometers driven, year of manufacture, month of manufacture, original price, owner
history, supply and demand factors, and perception factors. */

exports.calculateUsedBikePrice = (type, km, year, month, newPrice, owner, sdFactor, sdFactorConsecutive, supplyDemandFactorFirstConsecutive, sdFactorLater) => {
  let ownerFactor = 1 * calculateOwnerDepreciation(owner)
  let ageFactor = calculateAgeDepreciation(year, month, type, sdFactor, sdFactorConsecutive, supplyDemandFactorFirstConsecutive,sdFactorLater)
  let kmFactor = calculateKmDepreciation(km, year, month, type)
  let perceptionFactor = calculatePerceptionDepreciation(sdFactorConsecutive, type);

  return parseInt(newPrice * kmFactor * ageFactor * ownerFactor * perceptionFactor)
}

const calculateOwnerDepreciation = (owner) => {
  if (owner >= 3) {
    return .93
  }
  return 1
}

const calculatePerceptionDepreciation = (sdFactorConsecutive, type) => {
  // if (moment().month() >= 9 && moment().month() <= 10) {
  //   // moving half of additional con. year dep using consective sd factor
  //   switch (type) {
  //     case 'electric':
  //       return 1 - (.1 * (1 - sdFactorConsecutive))
  //     default:
  //       return 1 - (.05 * (1 - sdFactorConsecutive))
  //   }
  // }
  return 1
}

const calculateAgeDepreciation = (year, month, type, sdFactor, sdFactorConsecutive, supplyDemandFactorFirstConsecutive, supplyDemandFactorLater) => {
  let age = Math.abs(getMonthsDifference(month, year)) / 12
  let ageFactor = 1
  if (age < .25) {
    return type == 'electric' ? 1.1 * (1 - (1 - .7) * (1 - sdFactor)) : 1.1 * (1 - (1 - .8) * (1 - sdFactor))
  } else if (age < .5) {
    return type == 'electric' ? 1.07 * (1 - (1 - .7) * (1 - sdFactor)) : 1.07 * (1 - (1 - .8) * (1 - sdFactor))
  }
  else if (age < 1) {
    return type == 'electric' ? 1.04 * (1 - (1 - .7) * (1 - sdFactor)) : 1.04 *  (1 - (1 - .8) * (1 - sdFactor))
  } else {
    age = moment().year() - year
  }

  switch (type) {
    case 'electric':
      // age factor calculation
      for (let i = 1; i <= age; i++) {
        switch (i) {
          case 1:
            ageFactor *= 1 - (1 - .7) * (1 - sdFactor)
            break
          case 2:
          case 3:
            ageFactor *= 1 - (1 - .8) * (1 - supplyDemandFactorFirstConsecutive)
            break
          case 4:
          case 5:
          case 6:
          case 7:
          case 8:
            ageFactor *= 1 - (1 - .8) * (1 - sdFactorConsecutive)
            break
          default:
            ageFactor *= 1 - (1 - .8) * (1 - supplyDemandFactorLater)
            break
        }
      }
      break
    default:
      // age factor calculation
      for (let i = 1; i <= age; i++) {
        switch (i) {
          case 1:
            ageFactor *= 1 - (1 - .8) * (1 - sdFactor)
            break
          case 2:
          case 3:
            ageFactor *= 1 - (1 - .9) * (1 - supplyDemandFactorFirstConsecutive)
            break
          case 4:
          case 5:
          case 6:
          case 7:
          case 8:
            ageFactor *= 1 - (1 - .9) * (1 - sdFactorConsecutive)
            break
          default:
            ageFactor *= 1 - (1 - .9) * (1 - supplyDemandFactorLater)
            break
        }
      }
      break
  }
  return ageFactor
}



const calculateKmDepreciation = (km, year, month, type) => {
  let age = Math.abs(getMonthsDifference(month, year)) / 12
  if(age>=1){
    age=moment().year()-year
  }
  let kmFactor = 1
  let yearIndexMapper = [0, 3 / 12, 6 / 12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
  let yearIndex = yearIndexMapper.filter(yearVal => age >= yearVal).length - 1

  let kmTypeSteps = {
    'scooter': [1, 2, 4, 10, 20, 20, 30, 30, 30, 30, 30, 30, 30,],
    'moped':   [1, 2, 4, 10, 20, 20, 30, 30, 30, 30, 30, 30, 30,],
    'commuter':[1, 2, 4, 10, 20, 20, 30, 30, 30, 30, 30, 30, 30,],
    'sports':  [1, 2, 4, 10, 20, 20, 30, 30, 30, 30, 30, 30, 30,],
    'electric':[1, 2, 4, 10, 20, 20, 30, 30, 30, 30, 30, 30, 30,],
    'cruiser': [1, 2, 4, 10, 20, 30, 40, 40, 40, 40, 40, 40, 40,],
  }
  let typeDepreciation = {
    'cruiser': 0.95,
    'electric': 0.95,
    'commuter': 0.96,
    'scooter': 0.95,
    'moped': 0.96,
    'sports': 0.95,
  }

  const selectedKmTypeSteps = Array.from(new Set(kmTypeSteps[type])).sort((a, b) => { return a - b })
  const selectedTypeDepreciation = typeDepreciation[type]
  const normalcy = (kmTypeSteps?.[type]?.[yearIndex]) * 1000
  const applicableTypeSteps = selectedKmTypeSteps.filter((kmValue) => {
    return (normalcy <= (kmValue * 1000) && (kmValue * 1000) <= km)
  })

  for (let selectedKmTypeStep of selectedKmTypeSteps) {
    if ((selectedKmTypeStep * 1000) > km) {
      applicableTypeSteps.push(selectedKmTypeStep);
      break;
    }
  }

  for (let i = 0; i < applicableTypeSteps.length - 1; i++) {
    let modfactor = 1
    if (applicableTypeSteps[i] == kmTypeSteps?.[type]?.[0] || applicableTypeSteps[i] == kmTypeSteps?.[type]?.[1]) {
      modfactor = 3 / 12
    } else
      if (applicableTypeSteps[i] == kmTypeSteps?.[type]?.[2]) {
        modfactor = 6 / 12
      }

    let factor = (1 -
      modfactor * (1 - selectedTypeDepreciation) * (Math.min(km, applicableTypeSteps[i + 1] * 1000) - applicableTypeSteps[i] * 1000)
      / ((applicableTypeSteps[i + 1] - applicableTypeSteps[i]) * 1000)
    )
    kmFactor *= factor
  }
  
  const kmSlab = 1000 * kmTypeSteps?.[type]?.[kmTypeSteps?.[type].length - 1];
  if(km>kmSlab){
    const quotient = Math.floor((km-kmSlab)/10000)
    const remainder = ((km-kmSlab)%10000)||1
    const tempFactor=(1-((1 - selectedTypeDepreciation)*remainder/10000)) *  Math.pow((selectedTypeDepreciation), quotient)
    kmFactor*=tempFactor;
  }

  return kmFactor

}

const calculateMarginInflation = (currentInventoryLevels, modelInventoryMaxLevels) => {
  let inventoryMarginFactor = 1;
  if (currentInventoryLevels >= modelInventoryMaxLevels * 1.5) {
    inventoryMarginFactor = 1.5;
  }
  else if (currentInventoryLevels >= modelInventoryMaxLevels) {
    inventoryMarginFactor = 1.25;
  }
  return inventoryMarginFactor;
}

exports.calculatePricePostMargin = async (margins, usedPricePreRefurb, rfCost, newPrice, fuel, pace, makeModel, year, skipInventoryMarginInflation) => {
  let marginValue = 0;
  let isMarginRangeSet = false
  for (const margin of margins) {
    if (fuel == margin?.fuel?.toUpperCase() &&
      margin?.pace?.toUpperCase() == pace &&
      parseFloat(margin['range low']) <= usedPricePreRefurb &&
      usedPricePreRefurb <= parseFloat(margin['range high'])
    ) {
      marginValue = parseFloat(margin['absolute min'])
      if (margin['min percent']) {
        marginValue = Math.max(marginValue, Math.min(
          parseFloat(margin['absolute max']),
          parseFloat(margin['min percent']) * usedPricePreRefurb / 100,
        ))
      }
      isMarginRangeSet = true
      break
    }
  }

  let inventoryMarginFactor = 1;
  if (!skipInventoryMarginInflation) {
    const { currentInventoryLevels, modelInventoryMaxLevels, yearInventoryLevels } = await this.checkModelWarnings(makeModel);
    if (modelInventoryMaxLevels < 3) {
      inventoryMarginFactor = calculateMarginInflation(currentInventoryLevels, modelInventoryMaxLevels);
    } else {
      const { before2018, between2018To2022, after2022 } = yearInventoryLevels
      if (year <= 2018) {
        let maxInventoryOffset = (modelInventoryMaxLevels % 3) > 0 ? 1 : 0
        inventoryMarginFactor = calculateMarginInflation(before2018, maxInventoryOffset + parseInt(modelInventoryMaxLevels / 3));
      }
      else if (year >= 2022) {
        inventoryMarginFactor = calculateMarginInflation(after2022, parseInt(modelInventoryMaxLevels / 3));
      }
      else {
        let maxInventoryOffset = (modelInventoryMaxLevels % 3) > 1 ? 1 : 0
        inventoryMarginFactor = calculateMarginInflation(between2018To2022, maxInventoryOffset + parseInt(modelInventoryMaxLevels / 3));
      }
    }
  }
  const procPrice = parseInt(usedPricePreRefurb - rfCost - (inventoryMarginFactor * marginValue))
  return {
    isMarginRangeSet,
    marginValue: marginValue,
    adjustedMargin: marginValue * inventoryMarginFactor,
    procurementPrice: isMarginRangeSet?procPrice:0,
    procurementPriceMaxRange: isMarginRangeSet?parseInt(1.05 * procPrice) : 0,
    procurementPriceMinRange: isMarginRangeSet?parseInt(.9 * procPrice) : 0,
    marginMultiplier: inventoryMarginFactor
  }

}

exports.calculatePricePostMarkup = (margins, usedPricePreRefurb, fuel, pace, listingDate = undefined, marginValue = undefined, markupAppreciationOffset = 0) => {
  let markupValue = 0;
  let isMarginRangeSet = false
  let mspDiscountNewListing;
  let mspDiscountSecondry;
  let revisedPriceDelta;

  for (const margin of margins) {
    if (fuel == margin?.fuel?.toUpperCase() &&
      margin?.pace?.toUpperCase() == pace &&
      parseFloat(margin['range low']) <= usedPricePreRefurb &&
      usedPricePreRefurb <= parseFloat(margin['range high'])
    ) {
      mspDiscountNewListing = parseInt(margin["MSP Discount (New Listing)"])
      mspDiscountSecondry = parseInt(margin["MSP Discount (When revised listing price < calc price)"])
      markupValue = Math.max(parseFloat(margin['absolute min markup']), parseFloat(margin['markup %']) * usedPricePreRefurb / 100)
      isMarginRangeSet = true
      if (listingDate) {
        const daysSinceListed = moment().diff(moment(listingDate), 'days');
        const decreaseDelta = parseFloat(margin[`revision_${daysSinceListed - 1}_markup`] || 0) * markupValue + parseFloat(margin[`revision_${daysSinceListed}_margin`] || 0) * (marginValue || 0)
        revisedPriceDelta = roundDown250(decreaseDelta)
      }
      break
    }
  }

  return {
    isMarkupRangeSet: isMarginRangeSet,
    markupValue: markupValue + markupAppreciationOffset,
    listingPrice: roundUp250(usedPricePreRefurb + markupValue + markupAppreciationOffset),
    minSellingPrice: roundUp250(usedPricePreRefurb + markupValue - mspDiscountNewListing + markupAppreciationOffset),
    mspDiscountLeverage: mspDiscountSecondry,
    markupAppreciationOffset,
    ...(revisedPriceDelta ? { revisedPriceDelta } : {})
  }

}


// abs - 2% drop dual ->single->no 
// start type kickstart -12%
// fuel system no effect
// brake 1% per front and back 
// wheel type 2% drop
exports.calculateFeatureDepreciation = (variantFeatures, customFeatures) => {
  if(Object.keys(customFeatures||{}).length==0) return 1
  let factor = 1
  const featureKeyList = ['abs', 'startType', 'wheelType', 'fuelSystem', "rearBrakeType", "frontBrakeType"]
  const featureKeyMap = {}

  const absType = ['no', 'single channel abs', 'dual channel abs']
  const absDepreciationTable = [
  // to(across)   // no // single channel // dual channel
  /*from(down)*/[1, 1.02, 1.04] // no
    , [0.98, 1, 1.02] // single channel
    , [0.96, 0.98, 1] // dual channel
  ]
  featureKeyMap['abs'] = { typeList: absType, depreciationTable: absDepreciationTable }

  const startType = ['kick and electric', 'electric start', 'kick start']
  const startTypeDepreciationTable = [
  // to(across)   // ke  // e // k
  /*from(down)*/[1, 1, .88] // ke
    , [1, 1, .88] // e
    , [1.12, 1.12, 1] // k
  ]
  featureKeyMap['startType'] = { typeList: startType, depreciationTable: startTypeDepreciationTable }

  const wheelType = ['not alloy', 'alloy']
  const wheelTypeDepreciationTable = [
  // to(across)   // no alloy // alloy
  /*from(down)*/[1, 1.02] // no alloy
    , [.98, 1] // alloy
  ]
  featureKeyMap['wheelType'] = { typeList: wheelType, depreciationTable: wheelTypeDepreciationTable }

  const brakeType = ['disc', 'drum']
  const brakeTypeDepreciationTable = [
  // to(across)   // disc // drum
  /*from(down)*/[1, .99] // disc
    , [1.01, 1] // drum
  ]
  featureKeyMap['rearBrakeType'] = { typeList: brakeType, depreciationTable: brakeTypeDepreciationTable }
  featureKeyMap['frontBrakeType'] = { typeList: brakeType, depreciationTable: brakeTypeDepreciationTable }

  for (let featureKey of featureKeyList) {
    let typeMap = featureKeyMap[featureKey]?.typeList;
    let depreciationTable = featureKeyMap[featureKey]?.depreciationTable;
    if (typeMap && depreciationTable) {
      let fromIndex = Math.max(typeMap.findIndex(v => v == (variantFeatures[featureKey] || '').toLowerCase()), 0)
      let toIndex = Math.max(typeMap.findIndex(v => v == (customFeatures[featureKey] || '').toLowerCase()), 0)
      factor *= depreciationTable[fromIndex][toIndex]
    }
  }

  return factor;

}


const fetchLiveInventoryData = async (clusterName) => {
  let liveInventory;
  const cachedInventoryDataResp = await prisma.config.findFirst({
    where: {
      config_key: 'LIVE_INVENTORY_CACHE'
    }
  })

  const cachedInventoryDataTimerResp = await prisma.config.findFirst({
    where: {
      config_key: 'LIVE_INVENTORY_CACHE_TIME'
    }
  })
  const cacheInvalidateTimer = (cachedInventoryDataTimerResp?.value?.data||300000)/(1000*60); // default 5 min
  const cachedInventoryData = cachedInventoryDataResp.value;
  if (cachedInventoryData?.updatedAt && moment().diff(moment(cachedInventoryData.updatedAt), 'minute') < cacheInvalidateTimer) {
    liveInventory = cachedInventoryData.data
  } else { 
    liveInventory = await readData('Live_Inventory', '1ricdNoRwUVIEBAqP9vN8GYAgFp3sEQeWi06r8fX2rQo'); 
    await prisma.config.update({
      where: {
        id: cachedInventoryDataResp.id
      },
      data: {
        value: {
          data: liveInventory,
          updatedAt: moment()
        }
      }
    })
  }
  
  for (let item of liveInventory) {
    if (item[0]?.toLowerCase() == clusterName.toLowerCase()) {
      return {
        maxSupply: parseInt(item[1]),
        currentLevels: parseInt(item[2]),
        exists: true,
        before2018: item[3],
        "2019-2021": item[4],
        after2022: item[5]
      }
    }
  }
  return { exists: false }

}

exports.checkModelYearWarnings = async (makeModel, year) => {

  const warnings = []
  const bikeData = await prisma.$queryRaw`SELECT * FROM bike_features WHERE CONCAT(brand_name, ' ', model_name) LIKE ${makeModel} order by price desc limit 1`
  const bike = bikeData?.[0]
  if (!bike) {
    return ['Error fetching year limits']
  }
  if ((bike?.max_allowed_year || 2024) <= year || year <= (bike?.min_allowed_year || 2015)) {
    warnings.push('Vehicle breaches year criteria.')
  }
  if (bike?.bike_feature_cluster_id) {
    const bikeCluster = await prisma.bike_feature_cluster.findFirst({
      where: {
        id: bike?.bike_feature_cluster_id
      }
    })
    const liveClusterData = await fetchLiveInventoryData(bikeCluster.name);
    if (!liveClusterData.exists) {
      warnings.push('Cluster data missing.')
    }
    else {
      if (liveClusterData.maxSupply < 3) {
        if (liveClusterData.currentLevels >= liveClusterData.maxSupply)
          warnings.push(`For ${bikeCluster.name} we have ${liveClusterData.currentLevels} vehicles against the overall target of ${liveClusterData.maxSupply}. Buy new vehicles as per calculator suggested purchase price only.`)

      } else {
        let ageBracket;
        let ageBracketLimit;
        let ageBracketCurrentInventory;
        if (year <= 2018) {
          ageBracket = "before 2018";
          ageBracketLimit = parseInt(liveClusterData['maxSupply'] / 3) + ((liveClusterData['maxSupply'] % 3) > 0 ? 1 : 0);
          ageBracketCurrentInventory = liveClusterData["before2018"]
        }
        else if (year >= 2022) {
          ageBracket = "after 2022"
          ageBracketLimit = parseInt(liveClusterData['maxSupply'] / 3);
          ageBracketCurrentInventory = liveClusterData["after2022"]
        }
        else {
          ageBracket = "2019-2021"
          ageBracketLimit = parseInt(liveClusterData['maxSupply'] / 3) + ((liveClusterData['maxSupply'] % 3) > 1 ? 1 : 0);
          ageBracketCurrentInventory = liveClusterData["2019-2021"]
        }

        if (ageBracketCurrentInventory >= ageBracketLimit)
          warnings.push(`For ${ageBracket} we have ${ageBracketCurrentInventory} vehicles against the target of ${ageBracketLimit}. Buy new vehicles as per calculator suggested purchase price only.`)
      }
    }

  }
  else {
    warnings.push("Bike cluster not found")
  }
  return warnings
}

exports.checkModelWarnings = async (makeModel) => {

  const warnings = []
  const bikeData = await prisma.$queryRaw`SELECT * FROM bike_features WHERE CONCAT(brand_name, ' ', model_name) LIKE ${makeModel} order by price desc limit 1`
  const bike = bikeData?.[0]
  let currentInventoryLevels;
  let modelInventoryMaxLevels;
  let yearInventoryLevels;

  if (bike?.bike_feature_cluster_id) {
    const clusterData = await prisma.bike_feature_cluster.findFirst({
      where: {
        id: bike?.bike_feature_cluster_id
      }
    })
    if (!clusterData) {
      warnings.push('Cluster data missing.')
    }
    else {
      let clusterInventoryData = await fetchLiveInventoryData(clusterData?.name)
      if (clusterInventoryData?.exists) {
        currentInventoryLevels = clusterInventoryData.currentLevels
        modelInventoryMaxLevels = clusterInventoryData.maxSupply
        yearInventoryLevels = {
          before2018: parseInt(clusterInventoryData?.['before2018']),
          between2018To2022: parseInt(clusterInventoryData?.['2019-2021']),
          after2022: parseInt(clusterInventoryData?.['after2022']),
        }
        if (clusterInventoryData.currentLevels >= clusterInventoryData.maxSupply) {
          warnings.push(`Current Inventory levels are ${clusterInventoryData.currentLevels} against the limit set for ${clusterInventoryData.maxSupply}. Avoid procuring this vehicle.`)
        }
      }
      else {
        warnings.push('Cluster inventory data not found')
      }
    }
  } else {
    warnings.push('Bike cluster is not defined.')
  }

  return { warnings, currentInventoryLevels, modelInventoryMaxLevels, yearInventoryLevels }
}


exports.fetchModelPace = async (makeModel) => {

  const bikeData = await prisma.$queryRaw`SELECT id, brand_name ,model_name,variant_name, pace FROM bike_features WHERE CONCAT(brand_name, ' ', model_name) LIKE ${makeModel} order by price desc `
  const paces = new Set()
  for (let bike of bikeData) {
    paces.add(bike?.pace)
  }

  return Array.from(paces)



}


function getMonthsDifference(targetMonth, targetYear) {
  // Current date information
  const currentDate = moment()
  const currentYear = currentDate.year();
  const currentMonth = currentDate.month() + 1; // Months are zero-based, so add 1

  // Calculate the total months difference
  const totalMonths = (targetYear - currentYear) * 12 + (targetMonth - currentMonth);

  return totalMonths;
}