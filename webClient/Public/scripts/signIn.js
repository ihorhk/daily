var selectedCountry;
var previousErrorFieldRegistration;


$ (function () {

    var loginTitle = getTitleFromQuery(location.search);
    if (loginTitle) {
        $('#loginTitle').text(decodeURI(loginTitle));
    }

    var hash = window.location.hash;
    if (hash === '#register') {
        showRegister();
    }
    else {
        showLogin();
    }

    $('#loginTab').click(function () {
        showLogin();
        window.location.hash = '#login';
    });

    $('#registerTab').click(function () {
        showRegister();
        window.location.hash = '#register';
    });

    $('#loginForm').on('submit', function () {
        return submitLogin();
    });

    $('#forgotLoginForm').on('submit', function () {
        return submitForgotLogin();
    });

    $('#registrationForm').on('submit', function () {
        return submitRegistration();
    });

    $('#forgotLogin').on('click', function () {
        $('#loginContainer').hide();
        $('#forgotLoginContainer').show();
    });

    fillCountriesList();

    var termsAndConditionsCheckbox = $('#termsAndConditionsCheckbox');
    $('#termsAndConditionsLabel').click(function () {
        termsAndConditionsCheckbox.click();
    });

    $('#termsAndConditionsLink').click(function (e) {
        showTermsAndConditions();

        e.stopPropagation();
    })
});


function showLogin () {
    $('#registerTab').removeAttr('selected');
    $('#loginTab').attr('selected', true);
    $('#loginContainer').show();
    $('#registerContainer').hide();
    $('#forgotLoginContainer').hide();
}


function showRegister () {
    $('#loginTab').removeAttr('selected');
    $('#registerTab').attr('selected', true);
    $('#registerContainer').show();
    $('#loginContainer').hide();
    $('#forgotLoginContainer').hide();
}


function submitLogin () {
    var errorText = $('#loginError');
    errorText.hide();

    var usernameField = $('#loginUsername');
    var passwordField = $('#loginPassword');
    var username = usernameField.val();
    var password = passwordField.val();

    if (username.length < 5 || username.length > 20 || password.length < 4) {
        errorText.show();

        usernameField.attr('error', true);
        passwordField.attr('error', true);

        return false;
    }

    usernameField.removeAttr('error');
    passwordField.removeAttr('error');

    $('#loginSubmitButton').attr('disabled', true);

    $.ajax({
        type : 'POST',
        url : '/signIn',
        data : { username : username, password : password },
        dataType : 'json',
        statusCode : {
            200 : function (gameRulesUpdates) {
                if (gameRulesUpdates && gameRulesUpdates.length > 0) {
                    createGameRulesUpdatesDialog(gameRulesUpdates, function () {
                        goToContests();
                    })
                }
                else {
                    goToContests();
                }
            },
            401 : function () {
                $('#loginError').show();
                $('#loginSubmitButton').removeAttr('disabled');
            }
        }
    });

    return false;
}


function submitForgotLogin () {
    var emailOrUsername = $('#forgotLoginUsername').val();
    if (!emailOrUsername) {
        showForgotLoginError('Enter the username or the e-mail of your Daily Champion account');
        return false;
    }

    $('#forgotLoginUsername').removeAttr('error');
    $('#forgotLoginSubmit').attr('disabled', true);

    $.ajax(
        {
            type : 'POST',
            url : '/api/requestPasswordReset',
            data : { emailOrUsername : emailOrUsername },
            dataType : 'JSON',
            statusCode : {
                200 : function () {
                    $('#forgotLoginUsername').hide();
                    $('#forgotLoginSubmit').hide();
                    $('#forgotLoginSuccess').show();
                    $('#forgotLoginError').hide();
                },
                400 : function () {
                    showForgotLoginError('Enter the username or the e-mail of your Daily Champion account');
                },
                404 : function () {
                    showForgotLoginError('Sorry, we haven\'t found any match');
                },
                501 : function () {
                    showForgotLoginError('An error has been encountered. Please try again');
                }
            }
        }
    );

    return false;
}


function showForgotLoginError (msg) {
    var error = $('#forgotLoginError');
    error.text(msg);
    error.show();
    $('#forgotLoginUsername').attr('error', true);
    $('#forgotLoginSubmit').removeAttr('disabled');
}


function submitRegistration () {
    var username = $('#registerUsername').val();
    username = escapeHtml(username);
    var password = $('#registerPassword').val();
    var confirmPassword = $('#registerConfirmPassword').val();
    var firstName = $('#registerFirstName').val();
    var lastName = $('#registerLastName').val();
    var birthDay = $('#birthDay').val();
    var birthMonth = $('#birthMonth').val();
    var birthYear = $('#birthYear').val();
    var email = $('#registerEmail').val();
    var country = $('#countriesDropdown').val();
    var city = $('#city').val();
    var zipCode = $('#zipCode').val();
    var street = $('#street').val();
    var streetNum = $('#streetNumber').val();

    var errorMsg = null;
    var errorField = null;

    if (!$('#termsAndConditionsCheckbox').is(':checked')) {
        errorMsg = 'In order to register you must accept the Terms and Conditions';
    }

    // check street
    if (!streetNum || !isLatinString(streetNum)) {
        errorMsg = 'Please enter your address number';
        errorField = '#streetNumber';
    }
    if (!street) {
        errorMsg = 'Please enter your address';
        errorField = '#street';
    }
    else if (!isLatinString(street)) {
        errorMsg = 'Address is not valid';
        errorField = '#street';
    }

    if (!zipCode) {
        errorMsg = 'Zip code is required';
        errorField = '#zipCode';
    }
    else if (zipCode.length < 3 || !isLatinString(zipCode)) {
        errorMsg = 'Zip code is not valid';
        errorField = '#zipCode';
    }

    // check city validity
    if (!city) {
        errorMsg = 'Please enter your city of residence';
        errorField = '#city';
    }
    else if (!isLatinString(city)) {
        errorMsg = 'City is not valid';
        errorField = '#city';
    }

    if (!country || !isLatinString(country)) {
        errorMsg = 'Choose your country of residence';
        errorField = '#countriesDropdown';
    }
    else {
        country = getISOForCountryName(country);
    }

    // check birth date
    if (!isValidDate(birthYear, birthMonth, birthDay)) {
        errorMsg = 'Birth date is not valid';
        errorField = '.birthDateForm';
    }
    else {
        var birthDate = new Date((parseInt(birthYear) + 18) + '/' + birthMonth + '/' + birthDay);
        if (birthDate > new Date()) {
            errorMsg = 'You must be at least 18 years old';
            errorField = '.birthDateForm';
        }
    }

    // check first/last name
    if (!lastName) {
        errorMsg = 'Please enter your last name';
        errorField = '#registerLastName';
    }
    else if (!isLatinString(lastName)) {
        errorMsg = 'Last name is not valid';
        errorField = '#registerLastName';
    }
    if (!firstName) {
        errorMsg = 'Please enter your first name';
        errorField = '#registerFirstName';
    }
    else if (!isLatinString(firstName)) {
        errorField = '#registerFirstName';
        errorMsg = 'First name is not valid';
    }

    // check email validity
    if (!isValidEmail(email)) {
        errorMsg = 'Please enter a valid e-mail';
        errorField = '#registerEmail';
    }

    // check password
    var passwordError = checkPasswordValidity(password, confirmPassword);
    if (passwordError) {
        errorMsg = passwordError;
        errorField = '.registerPassword';
    }

    // remove white space at the end of username
    if (username[username.length - 1] === ' ') {
        username = username.substring(0, username.length - 1);
    }

    // check username
    if (username.length < 4) {
        errorField = '#registerUsername';
        errorMsg = 'The username must be at least 4 characters';
    }
    else if (username.length > 20) {
        errorField = '#registerUsername';
        errorMsg = 'Username too long';
    }
    else if (!/^[0-9a-zA-Z]+[_-]?/.test(username) || username.indexOf(' ') >= 0) {
        errorField = '#registerUsername';
        errorMsg = 'Username can only contain latin letters and numbers followed by - or _';
    }

    var errorText = $('#registrationError');

    if (errorMsg) {
        errorText.show();
        errorText.text(errorMsg);
        showErrorInRegistrationField(errorField);
    }
    else {
        if (previousErrorFieldRegistration) {
            previousErrorFieldRegistration.removeAttr('error');
        }

        birthDate = new Date(birthYear + '/' + birthMonth + '/' + birthDay);
        birthDate.setHours(birthDate.getHours() - (birthDate.getTimezoneOffset() / 60));

        // valid form! send the registration request to the server
        $('#registrationSubmitButton').attr('disabled', true);

        var data = {
            username : username,
            password : password,
            email : email,
            birthDate : birthDate,
            city : city,
            zipCode : zipCode,
            country : country,
            street : street,
            streetNum : streetNum,
            firstName : firstName,
            lastName : lastName
        };

        $.ajax({
            type : 'POST',
            url : '/api/createUser',
            data : data,
            dataType : 'json',
            statusCode : {
                200 : function (res) {
                    if (res.errorText) {
                        errorText.text(res.errorText);
                        return false;
                    }

                    $('#registrationForm').hide();
                    var registrationSuccess = $('#registrationSuccess');
                    registrationSuccess.show();
                    registrationSuccess.text('Welcome ' + data.username + '! To start playing, activate your account through the e-email sent at ' + data.email);
                },
                202 : function (res) {
                    registrationResponseError(res.responseText);
                },
                501 : function (res) {
                    registrationResponseError(res.responseText)
                }
            }
        });
    }

    return false;
}


function showErrorInRegistrationField (field) {
    if (previousErrorFieldRegistration) {
        previousErrorFieldRegistration.removeAttr('error');
    }
    previousErrorFieldRegistration = $(field);
    previousErrorFieldRegistration.attr('error', true);
}


function registrationResponseError (msg) {
    var error = $('#registrationError');
    error.text(msg);
    error.show();

    $('#registrationSubmitButton').removeAttr('disabled');
}


function isValidDate (y, m, d) {
    // Assume not leap year by default (note zero index for Jan)
    var daysInMonth = [31,28,31,30,31,30,31,31,30,31,30,31];

    // If evenly divisible by 4 and not evenly divisible by 100,
    // or is evenly divisible by 400, then a leap year
    if ( (!(y % 4) && y % 100) || !(y % 400)) {
        daysInMonth[1] = 29;
    }
    return d <= daysInMonth[--m]
}


function fillCountriesList () {
    var countriesDropDown = $('#countriesDropdown');

    for (var i = 0; i < COUNTRIES.length; i++) {
        countriesDropDown.append('<option>' + COUNTRIES[i].country + '</option>');
    }

    countriesDropDown.change(function () {
        var dropDown = $('#countriesDropdown');
        selectedCountry = dropDown.val();

        dropDown.removeAttr('default');
    });

    // get user's country
    $.getJSON('https://freegeoip.net/json/', function(result) {
        if (!selectedCountry) {
            var country = result.country_name;
            if (_.findIndex(COUNTRIES, { country : country }) < 0){
                $('#countriesDropdown').val("Country");
            }
            else{
                var countriesDropDown = $("#countriesDropdown")[0];
                for (var i = 1; i < countriesDropDown.length; i++) {
                    if (countriesDropDown[i].text === country) {
                        $(countriesDropDown[i]).attr('selected', true);
                        $(countriesDropDown[0]).removeAttr('selected');
                        $('#countriesDropdown').removeAttr('default');
                        break;
                    }
                }
                $('#countriesDropdown').val(country);
                selectedCountry = country;
            }
        }
    });
}


function getTitleFromQuery (query) {
    var arr = query.split('&');

    for (var i = 0; i < arr.length; i++) {
        var q = arr[i];

        if (q.indexOf('title') > 0) {
            return q.substring(q.indexOf('=') + 1);
        }
    }

    return null;
}


function showTermsAndConditions () {
    $.ajax(
        {
            type : 'GET',
            url : '/api/getTermsAndConditions',
            dataType : 'json',
            statusCode : {
                200 : function (res) {
                    createTermsAndConditionsDialog(null, res,
                        function () {
                        $('#termsAndConditionsCheckbox').prop('checked', true);
                    },
                        function () {
                            $('#termsAndConditionsCheckbox').prop('checked', false);
                    })
                }
            }
        }
    );
}