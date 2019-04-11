function teamLogoUrl (optasportsId, size) {
	return 'http://cache.images.core.optasports.com/soccer/teams/' + size + 'x' + size + '/' + optasportsId + '.png';
}


function smallTeamLogoUrl (optasportsId) {
	return teamLogoUrl(optasportsId, 30);
}


function mediumTeamLogoUrl (optasportsId) {
	return teamLogoUrl(optasportsId, 75);
}


function largeTeamLogoUrl (optasportsId) {
	return teamLogoUrl(optasportsId, 150);
}