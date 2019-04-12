
(function( $ ) {
    $.fn.loading = function () {

        // create loading element
        var loadingElement = document.createElement('div');
        loadingElement.id = 'loading';
        loadingElement.className = 'loading-container';
        var loadingSpinner = document.createElement('img');
        // loadingElement.innerHTML = 'Loading...';

        // set attribute for spinner
        loadingSpinner.src = '/icongraphy/svg/progress.svg';
        loadingSpinner.style.width = '95px';
        loadingSpinner.style.height = '95px';
        loadingSpinner.style.position = 'relative';
        loadingSpinner.style.top = 'calc(50% - 45px)';
        
        loadingElement.appendChild(loadingSpinner);

        // apply styles
        loadingElement.style.position = 'fixed';
        loadingElement.style.background = 'rgba(0,0,0,.3)';
        loadingElement.style.width = '100%';
        loadingElement.style.height = '100%';
        loadingElement.style.zIndex = '10000';
        loadingElement.style.textAlign = 'center';
        loadingElement.style.display = 'none';

        // attach it to DOM
        $(this).append(loadingElement);

        // position element
        $("#loading").position({
            my: "center center",
            at: "center center",
            of: window
        });

        $(loadingElement).show();

        // it should hide every time ajax is completed
        $(document).ajaxComplete(function () {
            $(loadingElement).hide();
        });
    };

})(jQuery);


