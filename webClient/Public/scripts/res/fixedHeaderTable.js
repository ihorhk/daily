( function($) {
    if( typeof($.fn.fixedHeaderTable) != 'undefined' ) {return false;} // prevent dmultiple scripts inits

    $.fn.fixedHeaderTable = function( opt ) {

        const $this = $(this);

        // adjust header width
        $.fn.fixedHeaderDraw = function() {
          
            $(this).each( function() {

                var $headerTable = $(this).closest('.fht_scroll').find('.fht_scrollHeadInner table');
                var options = $(this).data('options');

                if (options && options.hasOwnProperty('height')) {
                    var height = options['height'] - $headerTable.height();
                    var $scrollBody = $(this).closest('.fht_scrollBody');
                    $scrollBody.css({'height': height + 'px'});
                }

                var ths = $headerTable.find('thead th');
                var tds = $(this).find('thead tr:first-child th');
                var thCount = ths.length;
                var tdCount = tds.length;

                var totalWidth = 0;
                for(var i = 0; i < thCount && i < tdCount; i++) {
                    $(ths[i]).css('width', $(tds[i]).outerWidth());
                    totalWidth += $(tds[i]).outerWidth();
                }

                $(this).closest('.fht_scroll').find('.fht_scrollHead').css({'background-color': $(this).find('thead tr').css('background-color')});

                $(this).closest('.fht_scroll').find('.fht_scrollHeadInner').css({width: totalWidth + 'px'}).show();
            });

            return true;
        };
 
        // bind resize
        $(window).on('resize', function () {
            $this.fixedHeaderDraw();
        });

        // construct
        return this.each( function() {

            // check against double init
            if( !$(this).hasClass('fixedHeaderTable') ) {

                // wrap
                $(this).wrap('<div class="fht_scroll"></div>').wrap('<div class="fht_scrollBody forceScrollBar"></div>');

                var $scroll = $(this).closest('.fht_scroll');

                // generate header table
                var headerHTML = '';
                if (opt && opt.hasOwnProperty('headerHTML')) {
                    headerHTML = opt['headerHTML'];
                }

                $('<div class="fht_scrollHead">' + headerHTML + '<div class="fht_scrollHeadInner"><table><thead>' + $(this).find('thead').html() + '</thead></table></div></div>').prependTo($scroll);

                if (opt && opt.hasOwnProperty('onInit')) {
                    opt.onInit();
                }

                $(this).addClass('fixedHeaderTable');

                $(this).data('options', opt);

                var scrollBody = $(this).closest('.fht_scrollBody');
                scrollBody.on('scroll', function () {
                    var headerTable = $(this).closest('.fht_scroll').find('.fht_scrollHeadInner');
                    headerTable.css({left: - $(this).scrollLeft()});
                });
            }
            else if (opt && opt.hasOwnProperty('refreshHeader') && opt['refreshHeader']) {
                $(this).closest('.fht_scroll').find('.fht_scrollHeadInner table thead').html($(this).find('thead').html());
            }

            $(this).find('thead th').each(function() {
                $(this).empty();
                $(this).css({padding: 0}).show();
            });

            $this.fixedHeaderDraw();
        });
    };

})(jQuery);