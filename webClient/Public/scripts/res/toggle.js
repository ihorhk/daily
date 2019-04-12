( function($) {
    if ( typeof($.fn.init_toggle) != 'undefined' ) {return false;} // prevent dmultiple scripts inits
  
    $.fn.init_toggle = function(on_text, off_text) {

        // destruct
        $.fn.tvt_destroy = function() {
          
            $(this).each( function() {
                var $wrap = $(this).parents('.tvt-wrap');
                $wrap.children().not('input').remove();
                $(this).unwrap();
            });

            return true;
        };  

    
        // set to ON
        $.fn.tvt_on = function() {
          
            $(this).each( function() {
                var $wrap = $(this).parents('.tvt-wrap');
                var $input = $wrap.find('input');

                if ( typeof($.fn.prop) == 'function' ) {
                    $wrap.find('input').prop('checked', true);
                } else {
                    $wrap.find('input').attr('checked', true);
                }

                $wrap.find('input').trigger('tvt-on');
                $wrap.find('input').trigger('tvt-statuschange');
                $wrap.find('.tvt-switch').removeClass('tvt-off').addClass('tvt-on');

                // if radio - disable other ones 
                if ( $wrap.find('.tvt-switch').hasClass('tvt-radio-switch') ) {
                    var f_name = $input.attr('name');
                    $wrap.parents('form').find('input[name='+f_name+']').not($input).tvt_off(); 
                }
            });

            return true;
        };  
    
    
        // set to OFF
        $.fn.tvt_off = function() {
          
            $(this).each( function() {
                var $wrap = $(this).parents('.tvt-wrap');

                if ( typeof($.fn.prop) == 'function' ) {
                    $wrap.find('input').prop('checked', false);
                } else {
                    $wrap.find('input').attr('checked', false);
                }

                $wrap.find('input').trigger('tvt-off');
                $wrap.find('input').trigger('tvt-statuschange');
                $wrap.find('.tvt-switch').removeClass('tvt-on').addClass('tvt-off');
            });

            return true;
        };  
    
    
        // construct
        return this.each( function() {
          
            // check against double init
            if ( !$(this).parent().hasClass('tvt-wrap') ) {
          
                // default texts
                 
                var svgOn = '<svg class="tvt-cursor-on" width="8" height="8" viewBox="0 0 13 13" xmlns="http://www.w3.org/2000/svg"><path d="M10.688.907L4.261 10.05 2.09 7.885a.954.954 0 0 0-1.352 0 .96.96 0 0 0 0 1.356l2.971 2.978a.954.954 0 0 0 1.457-.125L12.251 2.01A.96.96 0 0 0 12.02.675a.953.953 0 0 0-1.33.232z" fill="#FFF" fill-rule="evenodd"/></svg>';
                // var svgOff = '<svg class="tvt-cursor-off" width="8" height="8" viewBox="2 2 26 26" xmlns="http://www.w3.org/2000/svg"><g fill="none" fill-rule="evenodd" stroke-linecap="round" stroke-linejoin="round" stroke="#F05445" stroke-width="2"><path d="M10 10l10 10M10 20l10.13-9.892"/></g></svg>';
                var svgOff = '';

                // labels structure
                var on_label = '<div class="tvt-label tvt-label-on">'+ svgOn +'</div>';
                var off_label = '<div class="tvt-label tvt-label-off">'+ svgOff +'</div>';
                
                // default states
                var disabled  = ($(this).is(':disabled')) ? true: false;
                var active    = ($(this).is(':checked')) ? true : false;
                
                var status_classes = '';
                status_classes += (active) ? ' tvt-on' : ' tvt-off'; 
                if ( disabled ) {status_classes += ' tvt-disabled';}

                // wrap and append
                var structure = 
                    '<div class="tvt-switch '+status_classes+'">' +
                        '<div class="tvt-cursor"></div>' +
                        on_label + off_label +
                        '</div>';
                 
                if( $(this).is(':input') && ($(this).attr('type') == 'checkbox' || $(this).attr('type') == 'radio') ) {
                  
                    $(this).wrap('<div class="tvt-wrap"></div>');
                    $(this).parent().append(structure);

                    $(this).parent().find('.tvt-switch').addClass('tvt-'+ $(this).attr('type') +'-switch');
                }

                // on click
                $(document).off('click tap', '.tvt-switch:not(.tvt-disabled)');
                $(document).on('click tap', '.tvt-switch:not(.tvt-disabled)', function(e) {

                    if ( $(this).hasClass('tvt-on') ) {
                        if ( !$(this).hasClass('tvt-radio-switch') ) { // not for radio
                            $(this).tvt_off();
                        }
                    } else {
                        $(this).tvt_on(); 
                    }
                });

                // on checkbox status change
                $(document).on('change', '.tvt-wrap input', function() {

                    if ( $(this).is(':checked') ) {
                        $(this).tvt_on();
                    } else {
                        $(this).tvt_off();  
                    } 
                });
            }
        });
    };
  
})(jQuery);