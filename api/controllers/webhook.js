

const prisma = require("../../db/prisma/prisma");
const { calculateUsedBikePrice, calculateUsedPrices } = require("../services/engine.service");
const { changePriceRequestStatusHelper, getLastStatusUpdate } = require("../services/revision.service");
const { PRICE_REQUEST_TYPES } = require("../utils/enums");
const { sendPriceRevisionAlert } = require("../utils/helper");
const moment = require('moment')

exports.createPriceRevisionRequests = async (req, res, next) => {
  try {
    const listedBikes = await prisma.bikes.findMany({
      where: {
        status: 'listed',
      },
      include: {
        bike_features: {
          select: { vehicle_type: true, }
        }
      }
    })

    for (let bike of listedBikes) {
      if (!bike?.listed_at) {
        continue
      }
      // get prices and markups
      let daysSinceListing = moment().diff(moment(bike?.listed_at), 'days')

      if (daysSinceListing >= 30) {
        if ((daysSinceListing - 30) % 7 == 0) {
          await sendPriceRevisionAlert(
            `Bike ${bike?.reg_no} id:${bike?.id} has been listed for more than 30 days`,
            `Bike details:\n
             reg_no: ${bike?.reg_no}\n
             brand_name: ${bike?.brand_name}\n
             model_name: ${bike?.model_name}\n
             variant_name: ${bike?.variant_name}\n
             km_driven: ${bike?.km_driven}\n
             listed_at: ${bike?.listed_at}\n
             registration_year: ${bike?.registration_year}\n
             initial_listing_price: ${bike?.initial_listing_price}\n
             minimum selling price: ${bike?.msp}\n
             ownership: ${bike?.ownership}\n
             current price: ${bike?.price}\n
            `
          )
        }
        continue
      }

      const { usedPrice, newPrice, postMarginCalculation, postMarkupCalculation } = await calculateUsedPrices({
        skipInventoryMarginInflation: true,
        makeModel: bike?.brand_name + " " + bike?.model_name,
        variant: bike?.variant_name,
        type: bike?.bike_features.vehicle_type,
        km: bike?.km_driven,
        year: bike?.registration_year,
        month: bike?.registration_month,
        owner: bike?.ownership + 1,
        refurbCost: 0, //TODO: take from proc sheet later
        onRoadPrice: null,
        additionalParams: {
          listingDate: bike?.listed_at
        }
      })
      const mailTableRow = []
      if (postMarkupCalculation?.revisedPriceDelta) {
        try {
          const result = await prisma.$transaction(async (tx) => {
            const procDetails = await tx.procurement_details.findFirst({
              where: {
                proc_id: bike.procurement_id
              },
            })
            await tx.price_revision_request.updateMany({
              data: { is_active: false },
              where: { bike_id: bike.id }
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
                request_type: PRICE_REQUEST_TYPES.REVISION,
                suggested_price: postMarkupCalculation?.listingPrice - postMarkupCalculation?.revisedPriceDelta,
                reg_no: bike?.reg_no,
                refurb: parseInt(procDetails?.actual_refurb_invoice || procDetails?.estimated_refurb_job_card || procDetails?.rfc_inspection),
                refurb_cost_type: procDetails?.actual_refurb_invoice ? 'actual_refurb_invoice' : (procDetails?.estimated_refurb_job_card ? 'estimated_refurb_job_card' : 'estimated_rfc_inspection'),
                insurance: procDetails?.insurance_estimated,
                last_bike_status: getLastStatusUpdate(bike)?.old,
              }
            })
            return priceRequest
          });

          if (Math.abs(result.suggested_price - bike.price) < 250) {
            await changePriceRequestStatusHelper({ priceRequestId: result.id, email: "VIA_SYSTEM", status: PRICE_REQUEST_STATUSES.REJECTED, reason: "Price difference is less than 250" });
          } else {
            mailTableRow.push(`
            <tr> 
            <td>${bike?.reg_no}</td>
            <td>${bike?.brand_name}</td>
            <td>${bike?.model_name}</td>
            <td>${bike?.variant_name}</td>
            <td>${bike?.km_driven}</td>
            <td>${bike?.listed_at}</td>
            <td>${bike?.registration_year}</td>
            <td>${bike?.ownership}</td>
            <td>${bike?.price}</td>
            <td>${postMarkupCalculation?.listingPrice - postMarkupCalculation?.revisedPriceDelta}</td>
            </tr>
            `)
          }
        } catch (e) {
          //alert user about revision failure for bike
          console.log(e)
        }
      }

      await sendPriceRevisionAlert(
        `Bikes have a new price revision request`,
        `Bikes details:\n
        <table>
        <tr>
        <th>reg_no </th>
        <th>brand_name </th>
        <th>model_name </th>
        <th>variant_name </th>
        <th>km_driven </th>
        <th>listed_at </th>
        <th>registration_year </th>
        <th>ownership </th>
        <th>current price </th>
        <th>suggested price after revision </th>
        </tr>
        ${mailTableRow.join('\n')}
        </table>
        `
      )


    }

    // create price revision request
    /*
    1. Price revision entry will be created in active state and all past entries for same bike will be marked inactive
    2. Status will be accepted or not accepted (and others)
    3. If entry is accepted change bike price to suggested price if rejected do nothing
    4. Details required for entry -> 
    make model variant, request data-> km, owner, regyr, refurb cost?
    Calculator prices?, current listed price, suggested price, modified_price, created_at,bike_status, bike id, type(listing/revision), status, reason, is_active
    */

    return res.json({
      status: 200,
      message: 'Webhook executed successfully',
    });
  } catch (error) {
    return next(error);
  }
};
