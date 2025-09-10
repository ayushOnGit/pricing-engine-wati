

const { Upload } = require('@aws-sdk/lib-storage');
const { S3 } = require('@aws-sdk/client-s3');

const s3 = new S3({
    region: process.env.AWS_DEFAULT_REGION,

    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
});

const uploadFileToS3 = async (request) => {
    const file = request?.file;
    const nameSuffix = request?.nameSuffix || '';
    const contentType = request?.contentType
    const contentEncoding = request?.contentEncoding
    const filePath = new Date().getTime() + Math.floor(Math.random() * 899999 + 100000) + `_${nameSuffix}`;
    const uploadParams = {
        Bucket: process.env.AWS_REFURB_BUCKET_NAME,
        Body: file,
        Key: filePath,
        ContentType: contentType,
        ContentEncoding: contentEncoding,
    };

    const meta = await new Upload({
        client: s3,
        params: uploadParams,
    }).done();

    const response = { link: `${process.env.S3_DISTRIBUTION_PATH}/${filePath}`, s3Link: meta?.Location };
    return response?.s3Link
}

module.exports = {
    uploadFileToS3
}