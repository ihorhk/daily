
$ (function () {

    $.ajax({
		type : 'GET',
		url : '/api/getTermsAndConditions',
		dataType : 'json',
		statusCode : {
			200 : function ( res ) {

				$('#tacContent').text(res.content);

				$('#tacVersion').text('Version ' + res.version);

			}
		}
	});

});

