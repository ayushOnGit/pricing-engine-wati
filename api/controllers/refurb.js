

const prisma = require("../../db/prisma/prisma");
const { AppsheetProvider } = require("../services/external/appsheet");
const { appendData } = require("../services/external/googleSheets");
const { uploadFileToS3 } = require("../services/external/s3");
const { parseQueryString } = require("../utils/helper");



exports.uploadRefurbVideo = async (req, res, next) => {
  try {
    const file = req.file
    const { queryParams: queryString } = req.body
    const queryParams = parseQueryString(queryString)
    if (queryParams.refurb_id && queryParams.name) {
      const s3location = await uploadFileToS3({
        file: file.buffer,
        nameSuffix: file?.originalname,
        contentType: file?.mimetype,
        contentEncoding: file?.encoding
      })

      // Uncomment to get data in google sheet
      // await appendData([[queryParams?.['id'],queryParams?.['name'],s3location, new Date().toUTCString()]],'inspectionVideos',process.env.INSPECTION_VIDEO_SHEET_ID)
      
      await prisma.refurb_videos.create({
        data:{
          email:queryParams.email,
          name:queryParams.name,
          refurb_id:queryParams.refurb_id,
          video_url:s3location
        }
      })

      await AppsheetProvider.updateRow([{
        "id":queryParams.refurb_id,
        [queryParams.name]:s3location,
      }],'inspection_main','b0b7a30b-dc6d-4e85-b658-c2d1387c68a4','V2-1U2Ep-80H2N-phMqw-npa5M-js7rZ-Gv0qd-qunf4-o3sdM')
      
    }
    return res.json({
      status: 200,
      message: 'File uploaded successfully',
    });
  } catch (error) {
    return next(error);
  }
};
