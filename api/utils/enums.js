const VEHICLE_TYPES = {
        SPORTS:"sports",
        COMMUTER:'commuter',
        CRUISER:"cruiser",
        SCOOTER:"scooter",
        ELECTRIC:"electric",
        MOPED: 'moped'
}

const PRICE_REQUEST_STATUSES = {
    ACCEPTED:'ACCEPTED',
    REJECTED:'REJECTED',
    MODIFIED:'MODIFIED',
}

const PRICE_REQUEST_TYPES = {
    LISTING:'LISTING',
    REVISION:'REVISION',
    MODIFICATION: 'MODIFICATION',
    MANUAL: 'MANUAL',
}
module.exports={
    VEHICLE_TYPES,
    PRICE_REQUEST_STATUSES,
    PRICE_REQUEST_TYPES
}