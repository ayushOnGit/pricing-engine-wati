const prisma = require("../../db/prisma/prisma");
const crypto = require('crypto');
const { convertCsvStringToJson } = require("../utils/helper");
const APIError = require("../utils/APIError");

exports.createRedirectorLinksFromFile = async (req, res, next) => {
    try {
        const linkCsv = req.file;
        if (!linkCsv) {
            throw new APIError({
                message: 'File not found',
                status: 404
            })
        }
        const jsonLinks = await convertCsvStringToJson(linkCsv.buffer.toString('utf-8'))
        if (jsonLinks.length > 20000) {
            return res.json({
                status: 200,
                message: 'Can only process 20k entries at a time',
            });
        }
        // Get the last ID of the last record in the table
        const lastRecord = await prisma.redirected_links.findFirst({
            orderBy: {
                id: 'desc',
            },
            select: {
                id: true,
            },
        });
        let counter = (lastRecord?.id + 1) || 0;
        const dbInsertObject = []
        for (let linkRow of jsonLinks) {
            let hash;
            if ((lastRecord?.id||0) > 0)
                hash = counter.toString() + Math.floor(Math.random() * 100)
            else
                hash = crypto.createHash('sha256').update(linkRow.key + linkRow.redirection_url).digest('hex').substring(0, 10);
            dbInsertObject.push({
                key: linkRow?.key,
                redirection_url: linkRow?.redirection_url,
                tag: linkRow?.tag,
                generated_hash: hash,
            })
            counter+=1
        }
        const links = await prisma.redirected_links.createMany({
            data: dbInsertObject,
            skipDuplicates: true,
        });

        return res.json({
            status: 200,
            message: 'File uploaded successfully',
        });
    } catch (error) {
        return next(error);
    }
};


exports.createRedirectorLinks = async (req, res, next) => {
    try {
        const { linkObj } = req.body;
        if (!linkObj || !linkObj.length) {
            throw new APIError({
                message: 'Invalid body found',
                status: 400
            })
        }
        const jsonLinks = linkObj;
        if (jsonLinks.length > 2000) {
            return res.json({
                status: 200,
                message: 'Can only process 2k entries at a time',
            });
        }
        // Get the last ID of the last record in the table
        const lastRecord = await prisma.redirected_links.findFirst({
            orderBy: {
                id: 'desc',
            },
            select: {
                id: true,
            },
        });
        let counter = (lastRecord?.id + 1) || 0;
        const dbInsertObject = []
        for (let linkRow of jsonLinks) {
            let hash;
            if (counter > 0)
                hash = counter.toString() + Math.floor(Math.random() * 100)
            else
                hash = crypto.createHash('sha256').update(linkRow.key + linkRow.redirection_url).digest('hex').substring(0, 10);
            dbInsertObject.push({
                key: linkRow?.key,
                redirection_url: linkRow?.redirection_url,
                tag: linkRow?.tag,
                generated_hash: hash,
            })
        }
        const links = await prisma.redirected_links.createManyAndReturn({
            data: dbInsertObject,
            skipDuplicates: true,
        });

        return res.json({
            status: 200,
            message: 'Links created successfully',
            links
        });
    } catch (error) {
        return next(error);
    }
};



exports.createReplaceRedirectorLink = async (req, res, next) => {
    try {
        const { linkRow } = req.body;
        if (!linkRow) {
            throw new APIError({
                message: 'Invalid body found',
                status: 400
            })
        }

        // Get the last ID of the last record in the table
        const lastRecord = await prisma.redirected_links.findFirst({
            orderBy: {
                id: 'desc',
            },
            select: {
                id: true,
            },
        });
        let counter = (lastRecord?.id + 1) || 0;


        let hash;
        if (counter > 0)
            hash = counter.toString() + Math.floor(Math.random() * 100)
        else
            hash = crypto.createHash('sha256').update(linkRow.key + linkRow.redirection_url).digest('hex').substring(0, 10);
        const dbInsertObject = {
            key: linkRow?.key,
            redirection_url: linkRow?.redirection_url,
            tag: linkRow?.tag,
            generated_hash: hash,
        }

        const existingLink = await prisma.redirected_links.findFirst({
            where: { key: linkRow?.key },
        })
        let link;
        if (existingLink) {
            delete dbInsertObject.key;
            link = await prisma.redirected_links.update({
                where: { id: existingLink.id },
                data: dbInsertObject,
            })
        } else {
            link = await prisma.redirected_links.create({
                data: dbInsertObject,
            });
        }
        return res.json({
            status: 200,
            message: 'Links created successfully',
            link
        });
    } catch (error) {
        return next(error);
    }
};



