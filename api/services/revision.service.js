const prisma = require("../../db/prisma/prisma");
const APIError = require("../utils/APIError");
const { PRICE_REQUEST_STATUSES, PRICE_REQUEST_TYPES } = require("../utils/enums")
const { createActivityLog } = require("../utils/helper")
const moment = require('moment');
/*
Inputs: priceRequestid, status (accepted, rejected, modified), modified price (if applicable)
Outputs: 
1. Send alert of status update unless no action is taken if request rejected
2. If status is accepted or modified price change price of the bike and create activity log
3. 
*/
exports.changePriceRequestStatusHelper = async ({ priceRequestId, status, modifiedPrice, email, reason }) => {

  const priceRequest = await prisma.price_revision_request.findFirst({
    where: {
      is_active: true,
      id: priceRequestId,
      status: null
    }
  })
  if (!priceRequest || priceRequest?.status) {
    throw new APIError({
      message: 'Valid price request not found.',
      status: 404
    })
  }

  if ((status == PRICE_REQUEST_STATUSES.MODIFIED || priceRequest.request_type == PRICE_REQUEST_TYPES.MANUAL)
    && (!modifiedPrice || isNaN(modifiedPrice) || modifiedPrice <= 0)) {
    throw new APIError({
      message: 'Invalid new price. Please try again with a valid price',
      status: 400
    })
  }

  const bike = await prisma.bikes.findFirst({
    where: {
      id: priceRequest.bike_id
    }
  })
  if (!bike) {
    throw new APIError({
      message: 'Bike not found.',
      status: 404
    })
  }

  let changeObj = {}
  let isChanged = false
  let priceReqChangeObj = {}
  let isPriceReqChanged = false
  switch (status) {
    case PRICE_REQUEST_STATUSES?.ACCEPTED:
      isChanged = true;
      isPriceReqChanged = true;
      priceReqChangeObj = {
        status: status,
        status_changed_by_user_email: email,
      }
      changeObj = {
        ...changeObj,
        updated_at: new Date(),
        price_request_approved: true,
        last_price_update_at: moment(),
        price: priceRequest.request_type == PRICE_REQUEST_TYPES.MANUAL ? priceRequest.modified_price : priceRequest.suggested_price,
        discount:
          (bike.initial_listing_price && (bike.initial_listing_price > priceRequest.suggested_price))
            ? bike.initial_listing_price - priceRequest.suggested_price
            : null,
        msp: priceRequest.msp,
        ...(
          ((PRICE_REQUEST_TYPES.LISTING == priceRequest.request_type) || (PRICE_REQUEST_TYPES.MODIFICATION == priceRequest.request_type))
            ? { initial_listing_price: priceRequest.suggested_price, }
            : {})
      }
      // revise price, change acitivy log

      break;

    case PRICE_REQUEST_STATUSES?.REJECTED:
      isPriceReqChanged = true;
      priceReqChangeObj = {
        status: status,
        status_changed_by_user_email: email,
        reason: reason,
      }
      break;

    case PRICE_REQUEST_STATUSES?.MODIFIED:
      isPriceReqChanged = true;
      priceReqChangeObj = {
        status: status,
        status_changed_by_user_email: email,
        modified_price: modifiedPrice,
        reason: reason,
      }
      // revise price, change acitivy log
      isChanged = true;
      changeObj = {
        ...changeObj,
        updated_at: new Date(),
        price_request_approved: true,
        last_price_update_at: moment(),
        price: modifiedPrice,
        discount:
          (bike.initial_listing_price && (bike.initial_listing_price > modifiedPrice))
            ? bike.initial_listing_price - modifiedPrice
            : null,
        msp: priceRequest.msp,
        ...(
          ((PRICE_REQUEST_TYPES.LISTING == priceRequest.request_type) || (PRICE_REQUEST_TYPES.MODIFICATION == priceRequest.request_type))
            ? { initial_listing_price: modifiedPrice, }
            : {})
      }
      break;
    default:
      throw new APIError({
        message: 'Unknown status sent for price request',
        status: 400
      })
  }

  if (isChanged) {
    await prisma.bikes.update({
      where: {
        id: priceRequest.bike_id
      },
      data: {
        ...changeObj,
        activity_logs: [...bike.activity_logs || [], createActivityLog({ name: "VIA_SYSTEM" }, bike, changeObj)],
      }
    })
  }
  if (isPriceReqChanged) {
    await prisma.price_revision_request.update({
      where: {
        id: priceRequest.id
      },
      data: { ...priceReqChangeObj, updated_at: moment() }
    })
  }
}

exports.getLastStatusUpdate = (bike) => {
  const actLogs = bike?.activity_logs
  if(!actLogs) return {}

  for(let i=actLogs.length-1;i>=0;i--){
    if(actLogs[i].event.includes('STATUS_CHANGED')){
      return {
        old: actLogs[i]?.old_value?.status,
        new: actLogs[i]?.new_value?.status
      }
    }
  }

  return {}  
}