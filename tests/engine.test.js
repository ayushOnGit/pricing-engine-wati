// Used to test the engine.js controller file



const { calculateUsedBikePrice, calculateUsedPrices } = require('../api/services/engine.service');

const moment = require('moment');

test('Test price validity', () => {
  const newBikePrice = 100000;
  // petrol cases
  //age 0
  expect(
    calculateUsedBikePrice('commuter', 0, moment().year(), moment().month() + 1, newBikePrice, 1, 0, 0, 0)
  ).toBe(newBikePrice * .88);

  //age less than 3 months
  expect(
    calculateUsedBikePrice('commuter', 0, moment().subtract(1, 'month').year(), moment().subtract(1, 'month').month() + 1, newBikePrice, 1, 0, 0, 0)
  ).toBe(newBikePrice * .8 * 1.1);

  //age 3 months
  expect(
    calculateUsedBikePrice('commuter', 0, moment().subtract(3, 'month').year(), moment().subtract(3, 'month').month() + 1, newBikePrice, 1, 0, 0, 0)
  ).toBe(newBikePrice * .8 * 1.07);

  //age 5 months
  expect(
    calculateUsedBikePrice('commuter', 0, moment().subtract(5, 'month').year(), moment().subtract(5, 'month').month() + 1, newBikePrice, 1, 0, 0, 0)
  ).toBe(newBikePrice * .8 * 1.07);


  //age 6 months
  expect(
    calculateUsedBikePrice('commuter', 0, moment().subtract(6, 'month').year(), moment().subtract(6, 'month').month() + 1, newBikePrice, 1, 0, 0, 0)
  ).toBe(newBikePrice * .8 * 1.04);

  //age 1 yr
  expect(
    calculateUsedBikePrice('commuter', 0, moment().subtract(12, 'month').year(), moment().subtract(12, 'month').month() + 1, newBikePrice, 1, 0, 0, 0)
  ).toBe(newBikePrice * .8);

  //age 2 yr
  expect(
    calculateUsedBikePrice('commuter', 0, moment().subtract(2, 'year').year(), 12, newBikePrice, 1, 0, 0, 0)
  ).toBe(newBikePrice * .8 * .9);



});



test('Price without and with feature matching', async () => {
  const checkTime = moment().subtract(1, 'year');
  let req = {
    makeModel: 'Honda Activa 125',
    variant: 'Drum',
    km: 100,
    year: checkTime?.year(),
    month: 1,
    owner: 1,
    refurbCost: 0,
    skipInventoryMarginInflation: false,
  }
  let reqWCustomFeature = {
    ...req,
    customFeature: {
      "abs": "CBS",
      "startType": "Kick and Electric",
      "wheelType": "Steel",
      "fuelSystem": "Fuel Injection",
      "rearBrakeType": "Drum",
      "frontBrakeType": "Drum"
    }
  }
  let reqWOCustomFeature = { ...req }
  let resWCustomFeature = await calculateUsedPrices(reqWCustomFeature)
  let resWOCustomFeature = await calculateUsedPrices(reqWOCustomFeature)
  expect(resWCustomFeature?.usedPrice).toBe(resWOCustomFeature?.usedPrice);
});

const checkUsedPriceMakeModel = async (yearOffset, makeModel, variant, expectedPrice, range) => {
  const checkTime = moment().subtract(yearOffset, 'year');
  let req = {
    makeModel: makeModel,
    variant: variant,
    km: 100,
    year: checkTime?.year(),
    month: 1,
    owner: 1,
    refurbCost: 0,
    skipInventoryMarginInflation: false,
  }

  let res = await calculateUsedPrices(req)
  expect(res?.usedPrice).toBeGreaterThan(expectedPrice - range);
  expect(res?.usedPrice).toBeLessThan(expectedPrice + range);

}

test('Test top models', async () => {

  await checkUsedPriceMakeModel(1, 'TVS Ntorq 125', 'Drum', 72800, 500);
  await checkUsedPriceMakeModel(2, 'TVS Ntorq 125', 'Drum', 64700, 500);
  await checkUsedPriceMakeModel(3, 'TVS Ntorq 125', 'Drum', 57500, 500);
  await checkUsedPriceMakeModel(4, 'TVS Ntorq 125', 'Drum', 51100, 500);

  await checkUsedPriceMakeModel(1, 'Honda Activa 6G', 'H-Smart', 73300, 500);
  await checkUsedPriceMakeModel(2, 'Honda Activa 6G', 'H-Smart', 65900, 500);
  await checkUsedPriceMakeModel(3, 'Honda Activa 6G', 'H-Smart', 59300, 500);
  await checkUsedPriceMakeModel(4, 'Honda Activa 6G', 'H-Smart', 53300, 500);

});



test('Test km beyond range', async () => {

  calculateUsedBikePrice('commuter', 65000, moment().subtract(3, 'year').year(), moment().subtract(3, 'year').month() + 1, 100000, 1, 0, 0, 0)

});







// test('Test margin inflation', () => {
//   const req = { 
//     makeModel, 
//     variant, 
//     type: externalType, 
//     km, 
//     year, 
//     month, 
//     owner, 
//     refurbCost, 
//     refurbCostPercent, 
//     onRoadPrice, 
//     customFeature, 
//     additionalParams, 
//     skipInventoryMarginInflation = false }
//   calculateUsedPrices(req)
//   expect(3).toBe(3);
// });
