const { Joi } = require('celebrate');

module.exports = {
  send: {
    body: {
      type: Joi.string().required().messages({
        'string.base': 'Test id must be a string',
        'string.empty': 'Test id cannot be empty',
        'any.required': 'Test id is a required field, Please fill all the required fields',
      }),
    
    },
  },

};
