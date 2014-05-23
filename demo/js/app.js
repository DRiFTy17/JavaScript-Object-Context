(function() {
    'use strict';
    
    angular.module('demoApp', ['ngObjectContext']);

    angular.module('demoApp').config(['objectContextProvider', function(objectContextProvider) {
      // Tell the context that we would like to restrict creation of a new
      // ObjectContext instance to a singleton
      objectContextProvider.restrictToSingleContext(true);

      // Set the path to our server side endpoint handler for get/post requests.
      objectContextProvider.setEndpointUri('/api/resource/');
    }]);
})();
