var socket = io();
var _playMode;

$ (function () {
    var page = window.location.pathname;
    _playMode = getUserPlayMode() || PLAY_MODE.REAL;

    var balance = getUserBalanceForCurrentPlayMode();
    if (isFreePlayMode()) {
        balance = formatPoints(balance);
    }
    else {
        balance = formatMoney(balance);
    }
    $('#balanceMoneyText').text(balance);

    switch (page) {
        case '/':
        case '/home':
            selectHeaderOption('headerHomeOption');
            break;

        case '/contests':
            selectHeaderOption('headerLobbyOption');
            break;

        case '/myContests':
            selectHeaderOption('headerContestsOption');
            break;

        case '/account':
            selectHeaderOption('headerAccountOption');
            break;
    }

    if (isUserLoggedIn()) {
        socket.on('balanceUpdate:' + getLoggedInUsername(), function (balance) {
            if (!isFreePlayMode()) {
                updateBalanceText(balance);
            }
        });

        socket.on('freeMoneyBalanceUpdate:' + getLoggedInUsername(), function (balance) {
            if (isFreePlayMode()) {
                updateBalanceText(balance);
            }
        });
    }

    // initialize Retina.js
    retinajs($('.has-retina'));

    $('#mainLogo').click(function () {
        goToContests();
    });
});


function updateBalanceText (balance) {
    if (isFreePlayMode()) {
        $('#balanceMoneyText').text(formatPoints(balance));
    }
    else {
        $('#balanceMoneyText').text(formatMoney(balance));
    }
}


function selectHeaderOption (optionId) {
    $('.mainHeaderOption').removeAttr('selected');
    $('#' + optionId).attr('selected', true);
}


function playModeChanged (playMode, balance) {
    _playMode = playMode;
    updateBalanceText(balance);
}


function isFreePlayMode () {
    return _playMode === PLAY_MODE.FREE;
}


// Detect window width
window.isDesktop = false;
window.isMobile = false;
window.isTablet = false;


function check_window_width() {
    // var window_width = $(window).width();

    // if (window_width < 768){
    //     window.isDesktop = false;
    //     window.isTablet = false;
    //     window.isMobile = true;
    // }
    // else if (window_width < 992){
    //     window.isDesktop = false;
    //     window.isTablet = true;
    //     window.isMobile = false;
    // }
    // else {
        window.isDesktop = true;
        window.isTablet = false;
        window.isMobile = false;
    // }
}

check_window_width();


$(document).ready(function() {
    // Account Pop Box
    $('.tv-toggle').init_toggle();
    
    var hover_delay = false;
    var delay_counter;
    $(document).on('mouseenter', '#profileButton', function () {
        account_box_reset();
        hover_delay = true;
        window.clearTimeout(delay_counter);

        $('#accountPopBox').css({
            'left': $(this).offset().left - 38,
            'top': $(this).offset().top + 36
        }).show();

        delay_counter = setTimeout(function(){
            hover_delay = false
        }, 500);
    });

    $(document).on('mouseleave', '#profileButton', function () {
        setTimeout(function(){
            if(!hover_delay && !$('#accountPopBox:hover').length){
                account_box_reset();
            }
        }, 501);
    });

    $(document).on('mouseleave', '#accountPopBox', function () {
        account_box_reset();
    });

    function account_box_reset() {
        $('#accountPopBox').hide();
    }

    $('#realContestsToggle').on('tvt-statuschange', function () {
        var val = $(this).prop('checked') ? PLAY_MODE.REAL : PLAY_MODE.FREE;
        var data = {
            playMode : val
        };

        $.ajax(
            {
                type : 'POST',
                url : '/api/setUserPlayMode',
                data : data,
                statusCode : {
                    200 : function () {
                        goToContests();
                    },
                    400 : function () {
                        createErrorDialog('Play mode', 'Failed to switch play mode: bad request.');
                    },
                    401 : function () {
                        goToLogin();
                    },
                    501 : function (err) {
                        createErrorDialog('Play mode', 'Failed to switch play mode: ' + err.responseText);
                    }
                }
            }
        );
    });


    // Tablet/Mobile Menu
    $('#mainHeader').find('.navCell nav').clone().appendTo('#mainMobileNavInner');
    var $menu_overlay = $('#mainMobileNavContainer');
    var $menu_inner = $('#mainMobileNavInner');
    var menu_width;

    function check_overlay_width() {
        if (window.isTablet) {
            menu_width = $menu_inner.outerWidth();
        }
        else if (window.isMobile) {
            menu_width = $(window).width();
        }
    }

    check_overlay_width();

    $('#mainMenuButton').click(function() {
        $menu_overlay.fadeIn(100, function() {
            check_overlay_width();
            $menu_inner.animate({right: '0px'}, 300);
        });
    });

    $('#mainMobileNavCloseButton').click(function() {
        $menu_inner.animate({right: -menu_width}, 300, function() {
            $menu_overlay.fadeOut(100, function() {

            });
        })
    });


    resizeFooterBanner();
});


$(window).on('resize', function() {
    resizeFooterBanner();
    check_window_width();

    $('.clusterizeTable').each( function () {
        drawClusterizeHeadTable($(this));
    });
});


function resizeFooterBanner () {
    var $content = $('#mainFooterContent');
    $('#mainFooterBanner').width(parseInt($content.css('margin-left')) + $content.outerWidth() * 0.129);
}


function drawClusterizeHeadTable (table) {
    var $headTableContainer = $(table).closest('.clusterize').find('.headTableContainer');

    if ($headTableContainer.length) {
        var $headTable = $headTableContainer.find('.headTable');
        var ths = $headTable.find('thead th');
        var tds = $(table).find('thead tr:first-child th');
        var thCount = ths.length;
        var tdCount = tds.length;
        var totalWidth = 0;

        for(var i = 0; i < thCount && i < tdCount; i++) {
            $(ths[i]).css('width', $(tds[i]).outerWidth());
            totalWidth += $(tds[i]).outerWidth();
        }

        $headTableContainer.css({width: totalWidth + 'px'}).show();
    }
}


function requestNewAccountVerificationEmail () {
    $.ajax(
        {
            type : 'POST',
            url : '/api/requestAccountVerificationEmail',
            dataType : 'json',
            statusCode : {
                200 : function (res) {
                    createWarningDialog('Account verification', 'A new e-mail has been sent to ' + res.responseText
                        + '. Follow the instructions contained in it to complete your registration.');
                },
                202 : function (res) {
                    createWarningDialog('Account verification', res.responseText);
                },
                501 : function (res) {
                    createErrorDialog('Request failed', res.responseText);
                }
            }
        }
    );
}