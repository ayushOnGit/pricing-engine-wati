const APIError = require('../utils/APIError');

exports.authorize = (roles) => async (req, res, next) => {
  try {
    const jwtToken = req.headers.authorization;
    if (!jwtToken) {
      return next(
        new APIError({
          status: 404,
          message: 'Token not found in the Headers',
        }),
      );
      // for demo purpose we are not decoding the token and expecting decoded token
    }
    req.user = JSON.parse(jwtToken);

    return next();
  } catch (err) {
    const status = err?.response?.status ?? 500;
    const message = err?.response?.data?.message ?? 'AUTH_INTERNAL_SERVER_ERROR';
    const errors = err?.response?.data?.errors ?? ['auth service failed'];
    next(new APIError({ status, message, errors }));
  }
};
