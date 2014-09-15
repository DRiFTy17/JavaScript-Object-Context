(function() {
    'use strict';
    
    angular.module('demoApp', ['ngObjectContext']);

    angular.module('demoApp').config(['objectContextProvider', function(objectContextProvider) {
    	objectContextProvider.setObjectTypePropertyName('ObjectDataType');
    	objectContextProvider.setObjectKeyPropertyName('ObjectKeyFields');
    	objectContextProvider.setServiceUri('http://localhost:8888/AngularChangeTracker/demo/');
        // Configure the object context provider here...
    }]);
})();
