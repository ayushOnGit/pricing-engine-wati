
const prisma = require("../../db/prisma/prisma");
const { calculateUsedPrices } = require("../services/engine.service");
const { sendEmail } = require("../services/external/commsEngine");
const { changePriceRequestStatusHelper, getLastStatusUpdate } = require("../services/revision.service");
const APIError = require('../utils/APIError');
const { PRICE_REQUEST_STATUSES, PRICE_REQUEST_TYPES } = require("../utils/enums");
const { createActivityLog, sendPriceRevisionAlert } = require("../utils/helper");
const moment = require('moment')


const getBikeModificationFields = (bike) => {
  const actLogs = bike?.activity_logs
  const latestActLog = actLogs[actLogs.length-1];
  if(!latestActLog) return {}
  const dependentFieldEvents = {
    "BRAND_NAME_CHANGED":'brand_name',
    "MODEL_NAME_CHANGED":'model_name',
    "VARIANT_NAME_CHANGED":'variant_name',
    "OWNERSHIP_CHANGED":'ownership',
    "KM_DRIVEN_CHANGED":'km_driven',
    "REGISTRATION_YEAR_CHANGED":'registration_year',
    "REGISTRATION_MONTH_CHANGED":'registration_month',
  }
  let changeLog = {}
  for (const field of Object.keys(dependentFieldEvents)) {
   if(latestActLog?.event?.includes(field) ){
    changeLog[field]={old:latestActLog?.old_value?.[dependentFieldEvents[field]],new:latestActLog?.new_value?.[dependentFieldEvents[field]]}
   }
  }
  return changeLog;  
}

exports.createListingPriceRequest = async (req, res, next) => {
  /*
  Inputs: vehicle details
  Outputs: 
    1. Vehicle price request created
    2. Alert sent to stakeholders
    3. Update bike table with initial listing & price leverage? 

  */
  try {
    const { bikeId, isModification } = req.body

    const bike = await prisma.bikes.findFirst({
      where: {
        id: bikeId
      },
      include: {
        bike_features: true,
      }
    })
    if (!bike) {
      throw new APIError({
        message: "Bike not found",
        status: 404,
      })
    }
    getBikeModificationFields(bike)

    const procDetails = await prisma.procurement_details.findFirst({
      where: {
        proc_id: bike.procurement_id
      },
    })

    // get prices and markups
    const { usedPrice, newPrice, postMarginCalculation, postMarkupCalculation } = await calculateUsedPrices({
      makeModel: bike?.brand_name + " " + bike?.model_name,
      variant: bike?.variant_name,
      type: bike?.bike_features.vehicle_type,
      km: bike?.km_driven,
      year: bike?.registration_year,
      month: bike?.registration_month,
      owner: bike?.ownership + 1,
      refurbCost: parseInt(procDetails?.actual_refurb_invoice || procDetails?.estimated_refurb_job_card || procDetails?.rfc_inspection),
      onRoadPrice: null,
      skipInventoryMarginInflation: true,
    })

    const result = await prisma.$transaction(async (tx) => {

      await tx.price_revision_request.updateMany({
        data: { is_active: false },
        where: { bike_id: bikeId }
      })

      const priceRequest = await tx.price_revision_request.create({
        data: {
          bike_id: bike?.id,
          current_listed_price: bike?.price || 0,
          kms: bike?.km_driven,
          make: bike?.brand_name,
          model: bike?.model_name,
          variant: bike?.variant_name,
          owner: bike?.ownership,
          registration_year: bike?.registration_year,
          registration_month: bike?.registration_month,
          bike_status: bike?.status,
          calculator_prices: { usedPrice, newPrice, postMarginCalculation, postMarkupCalculation },
          is_active: true,
          markup: postMarkupCalculation?.markupValue,
          msp: postMarkupCalculation?.minSellingPrice,
          request_type: isModification ? PRICE_REQUEST_TYPES.MODIFICATION : PRICE_REQUEST_TYPES.LISTING,
          suggested_price: postMarkupCalculation?.listingPrice,
          reg_no: bike?.reg_no,
          refurb: parseInt(procDetails?.actual_refurb_invoice || procDetails?.estimated_refurb_job_card || procDetails?.rfc_inspection),
          refurb_cost_type: procDetails?.actual_refurb_invoice ? 'actual_refurb_invoice' : (procDetails?.estimated_refurb_job_card ? 'estimated_refurb_job_card' : 'estimated_rfc_inspection'),
          insurance: procDetails?.insurance_estimated,
          bike_modification_meta: isModification?getBikeModificationFields(bike):{},
          last_bike_status: getLastStatusUpdate(bike)?.old,
        }
      })
      return priceRequest
    })
    if (Math.abs(result.suggested_price - bike.price) < 250) {
      await changePriceRequestStatusHelper({ priceRequestId: result.id, email: "VIA_SYSTEM", status: PRICE_REQUEST_STATUSES.REJECTED, reason: "Price difference is less than 250" });
    }
    else {
      await sendPriceRevisionAlert(
        `Bike has a new price listing request`,
        `Bike details:\n
       <table>
       <tr>
       <th>reg_no</th>
       <th>brand_name</th>
       <th>model_name</th>
       <th>variant_name</th>
       <th>km_driven</th>
       <th>listed_at</th>
       <th>registration_year</th>
       <th>ownership</th>
       <th>suggested price </th>
       </tr>

       <tr>
       <td>${bike?.reg_no}</td>
       <td>${bike?.brand_name}</td>
       <td>${bike?.model_name}</td>
       <td>${bike?.variant_name}</td>
       <td>${bike?.km_driven}</td>
       <td>${bike?.listed_at}</td>
       <td>${bike?.registration_year}</td>
       <td>${bike?.ownership}</td>
       <td>${postMarkupCalculation?.listingPrice}</td>
       </tr></table>
      `
      )
    }
    
    return res.json({
      status: 200,
      message: 'Bikes sent successfully',
      result,
    });
  } catch (error) {
    return next(error);
  }
};


exports.changePriceRequestStatus = async (req, res, next) => {

  try {
    const { priceRequestId, status, modifiedPrice, email, reason } = req.body
    await changePriceRequestStatusHelper({ priceRequestId: parseInt(priceRequestId), status, modifiedPrice: parseInt(modifiedPrice), email, reason })
    return res.json({
      status: 200,
      message: 'Price request action completed successfully',
    });

  } catch (error) {
    return next(error);
  }
}

exports.createManualPriceRequest = async (req, res, next) => {

  try {
    const { bikeId, reason, email, userPrice } = req.body
    if (!userPrice || isNaN(userPrice) || userPrice <= 0) {
      throw new APIError({
        message: 'Invalid new price. Please try again with a valid price',
        status: 400
      })
    }
    const bike = await prisma.bikes.findFirst({
      where: {
        id: bikeId
      },
      include: {
        bike_features: true,
      }
    })
    if (!bike) {
      throw new APIError({
        message: "Bike not found",
        status: 404,
      })
    }

    const procDetails = await prisma.procurement_details.findFirst({
      where: {
        proc_id: bike.procurement_id
      },
    })

    // get prices and markups
    const { usedPrice, newPrice, postMarginCalculation, postMarkupCalculation } = await calculateUsedPrices({
      makeModel: bike?.brand_name + " " + bike?.model_name,
      variant: bike?.variant_name,
      type: bike?.bike_features.vehicle_type,
      km: bike?.km_driven,
      year: bike?.registration_year,
      month: bike?.registration_month,
      owner: bike?.ownership + 1,
      refurbCost: parseInt(procDetails?.actual_refurb_invoice || procDetails?.estimated_refurb_job_card || procDetails?.rfc_inspection),
      onRoadPrice: null,
      skipInventoryMarginInflation: true,
    })

    const result = await prisma.$transaction(async (tx) => {

      await tx.price_revision_request.updateMany({
        data: { is_active: false },
        where: { bike_id: bikeId }
      })

      const priceRequest = await tx.price_revision_request.create({
        data: {
          bike_id: bike?.id,
          current_listed_price: bike?.price || 0,
          kms: bike?.km_driven,
          make: bike?.brand_name,
          model: bike?.model_name,
          variant: bike?.variant_name,
          owner: bike?.ownership,
          registration_year: bike?.registration_year,
          registration_month: bike?.registration_month,
          bike_status: bike?.status,
          calculator_prices: { usedPrice, newPrice, postMarginCalculation, postMarkupCalculation },
          is_active: true,
          markup: postMarkupCalculation?.markupValue,
          msp: postMarkupCalculation?.minSellingPrice,
          request_type: PRICE_REQUEST_TYPES.MANUAL,
          suggested_price: postMarkupCalculation?.listingPrice,
          reg_no: bike?.reg_no,
          reason: reason,
          modified_price: userPrice,
          refurb: parseInt(procDetails?.actual_refurb_invoice || procDetails?.estimated_refurb_job_card || procDetails?.rfc_inspection),
          refurb_cost_type: procDetails?.actual_refurb_invoice ? 'actual_refurb_invoice' : (procDetails?.estimated_refurb_job_card ? 'estimated_refurb_job_card' : 'estimated_rfc_inspection'),
          insurance: procDetails?.insurance_estimated,
          request_created_by: email,
          last_bike_status: getLastStatusUpdate(bike)?.old,
        }
      })

      return priceRequest
    })
    await changePriceRequestStatusHelper({ priceRequestId: result.id, modifiedPrice: parseInt(userPrice), email, status: PRICE_REQUEST_STATUSES.ACCEPTED });
    await sendPriceRevisionAlert(
      `Bike has been applied with a new manual price request`,
      `Bike details:\n
      <table>
      <tr>
       <th> reg_no </th>
       <th> brand_name </th>
       <th> model_name </th>
       <th> variant_name </th>
       <th> km_driven </th>
       <th> listed_at </th>
       <th> registration_year </th>
       <th> ownership </th>
       <th> suggested price  </th>
      </tr>
       
      <tr>
       <td>${bike?.reg_no}</td>
       <td>${bike?.brand_name}</td>
       <td>${bike?.model_name}</td>
       <td>${bike?.variant_name}</td>
       <td>${bike?.km_driven}</td>
       <td>${bike?.listed_at}</td>
       <td>${bike?.registration_year}</td>
       <td>${bike?.ownership}</td>
       <td>${postMarkupCalculation?.listingPrice}</td>
       </tr>
       </table>
      `
    )
    return res.json({
      status: 200,
      message: 'Bikes sent successfully',
      result,
    });
  } catch (error) {
    return next(error);
  }
};
