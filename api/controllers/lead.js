

const prisma = require("../../db/prisma/prisma");
const moment = require('moment-timezone');
const { appendData } = require("../services/external/googleSheets");

exports.getSupplyUiConfig = async (req, res, next) => {
    try {
        const config = await prisma.config.findFirst({
            where: {
                config_key: 'SUPPLY_UI_CONFIG',
            },
        })
        return res.json({
            status: 200,
            data: config?.value || {},
        });
    } catch (error) {
        return next(error);
    }
}


exports.submitSupplyLead = async (req, res, next) => {
    try {
        const { lead_source, additional, reg_no, metadata, email } = req.body
        const {
            selectedMake,
            selectedVariant,
            owner,
            km,
            year,
            refurbCost,
            vuttoPrice,
        } = metadata
        const lead = await prisma.pricing_engine_lead_form.create({
            data: {
                lead_source,
                source_specification: additional,
                price_response: metadata,
                email: email,
                selected_make: selectedMake,
                selected_variant: selectedVariant,
                owner: parseInt(owner) - 1,
                km: parseInt(km),
                vutto_price: vuttoPrice,
                year: parseInt(year),
                vehicle_registration: reg_no,
                refurb_cost: parseInt(refurbCost),
            }
        })

        //submit lead data to sheet
        const IST = 'Asia/Kolkata';
        const formattedDate = moment().tz(IST).format('DD/MM/YYYY HH:mm');
        const customFormattedDate = moment().tz(IST).format('DD-MMM').toString();  
        //submit lead data to sheet
        await appendData([[
            customFormattedDate+"",
            email,
            selectedMake, 
            selectedVariant, 
            (parseInt(owner)-1)+"", 
            year, 
            km, 
            reg_no, 
            vuttoPrice,
            metadata?.procurementPrice,
            lead_source,
            additional,
            refurbCost
        ]], 'test', '1GgenhWcUM7SI18BXkJUKf42I5fB1V0Y0Qnxcy_8Wgu8')

        await appendData([[
            customFormattedDate+"",
            email,
            selectedMake, 
            selectedVariant, 
            (parseInt(owner)-1)+"", 
            year, 
            km, 
            reg_no, 
            vuttoPrice,
            metadata?.procurementPrice,
            lead_source,
            additional,
            refurbCost
        ]], 'leads_data', '1xkqK7-RZYg6JUeJqKP3B91ZiCBnWjleiNVwYaCLDmJk')

        return res.json({
            status: 200,
        });
    } catch (error) {
        return next(error);
    }
}