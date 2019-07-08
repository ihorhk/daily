var token;

$ (function () {

    token = getTokenFromQuery(location.search);

    // login and cancel buttons
    $('#resetPasswordForm').on('submit', function () {

        $('#resetPasswordSubmit').attr('disabled', true);

        var errorText = $('#resetPasswordError');
        errorText.hide();

        var passwordField = $('#resetPasswordNewPassword');
        var password = passwordField.val();

        passwordField.removeAttr('error');

        $.ajax({
            type : 'POST',
            url : '/api/resetPassword',
            data : { passwordResetToken : token, password : password },
            dataType : 'json',
            statusCode : {
                200 : function () {
                    goToLogin('Your password has been changed successfully!');
                },
                202 : function (err) {
                    showError(err);
                },
                400 : function (err) {
                    showError(err);
                },
                401 : function (err) {
                    showError(err);
                },
                501 : function (err) {
                    showError(err);
                }
            }
        });

        return false;
    });
});


function showError (msg) {
    var error = $('#resetPasswordError');
    error.text(msg.responseText);
    error.show();
    $('#resetPasswordNewPassword').attr('error', true);
    $('#resetPasswordSubmit').removeAttr('disabled', true);
}


function getTokenFromQuery (query) {
    var arr = query.split('&');

    for (var i = 0; i < arr.length; i++) {
        var q = arr[i];

        if (q.indexOf('token') > 0) {
            return q.substring(q.indexOf('=') + 1);
        }
    }

    return null;
}
