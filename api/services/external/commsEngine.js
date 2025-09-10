const { CommsProvider } = require("../../providers/comms.provider")


exports.sendEmail = async (from, to, subject, body) => {
    try {
        const resp = await CommsProvider.post('/api/notification/send/alert-email', {
            from, to, subject, body
        })
        return resp
    } catch (e) {
        console.log(e)
    }
}