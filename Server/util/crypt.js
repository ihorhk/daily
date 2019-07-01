var bcrypt = require('bcryptjs');


function hashPassword (password) {
    return bcrypt.hashSync(password, bcrypt.genSaltSync(10));
}


function checkPasswordValidity (password, hash) {
    return bcrypt.compareSync(password, hash);
}


exports.encryptPassword = hashPassword;
exports.checkPasswordValidity = checkPasswordValidity;