(function(angular) {
    'use strict';

    /**
     * An AngularJS object context/change tracking module.
     * 
     * This module can be used to load a JavaScipt object, that will be watched
     * for changes. 
     * 
     * It can be configured to only allow a single instance of the context, or 
     * multiple contexts can exists in a single application if need be.
     * 
     * To enable GET and POST requests for fetching/saving objects from/to the
     * server, just pass a valid URI to send the requests to.
     */
    angular.module('ngObjectContext', []).provider('objectContext', function () {

        /**
         * This flag allows the context to be configured to only allow one instance
         * if set to true.
         * 
         * @private
         */
        var _isSingleton = true;

        /**
         * The URI to use when making service requests.
         *
         * @private
         */
        var _serviceUri = null;

        /**
         * The property name which represents an objects type as string.
         *
         * @private
         */
        var _objectTypePropertyName = 'ObjectDataType';

        /**
         * The property name which represents an objects key as an array.
         *
         * @private
         */
        var _objectKeyPropertyName = 'ObjectKeyFields';

        /**
         * This will hold the one singleton instance of this class if '_isSingleton'
         * is set to true.
         * 
         * @private
         */
        var _instance = null;

        /**
         * This holds the types of objects that can be retrieved from us and used with an ObjectContext.
         * 
         * @private
         */
        var _typeCache = [];

        /**
         * This is the property name (set by the developer) that is used to fetch object instances from the type cache.
         * 
         * @private
         */
        var _typeIdentifierPropertyName;

        /**
         * Call this with true to allow multiple instances of the ObjectContext
         * to be created when called through this service.
         * 
         * @public
         */
        this.allowMultipleInstances = function (allow) {
            _isSingleton = !allow;
        };

        /**
         * Configures the context to make requests to the specified URI.
         *
         * @public
         * @param {string} uri
         */
        this.setServiceUri = function (uri) {
            if (uri.substring(uri.length - 1) !== '/') {
                uri += '/';
            }

            _serviceUri = uri;
        };

        /**
         * This tells the context which property to look for on objects that are being added.
         * If it finds a property with the provided name, then that objects value will be 
         * used for representing the type of object as string.
         *
         * The default value for the property name is 'ObjectDataType'.
         */
        this.setObjectTypePropertyName = function (propertyName) {
            _objectTypePropertyName = propertyName;
        };

        /**
         * This tells the context which property to look for on objects that are being added.
         * If it find a property with the provided name, then that objects value will be
         * used as its key.
         *
         * @public
         * @param {string} propertyName
         */
        this.setObjectKeyPropertyName = function (propertyName) {
            _objectKeyPropertyName = propertyName;
        };

        /**
         * The domain context factory function.
         */
        this.$get = ['$rootScope',
            function ($rootScope) {
                /**
                 * An array holding registered $digest watchers and the context 
                 * instance they are registered to.
                 * 
                 * @type Array
                 * @private
                 */
                var digestWatchers = [];

                /**
                 * Creates a new ObjectContext instance. If true is passed, then a $digest
                 * watch is created, and any digest calls will evaluate our tracked objects
                 * for changes.
                 *
                 * If we were configured to only one instance of a context, then that will
                 * be returned if it exists.
                 * 
                 * @param {boolean} evalOnDigest Optional value that determines whether or not the context will automatically watch for changes.
                 */
                var _create = function (canEvalOnDigest) {
                    canEvalOnDigest = typeof canEvalOnDigest !== 'undefined' ? !!canEvalOnDigest : true;

                    if (_isSingleton) {
                        if (!_instance) {
                            _instance = new ObjectContext();

                            _instance.setServiceUri(_serviceUri);

                            _instance.setObjectTypePropertyName(_objectTypePropertyName);
                            _instance.setObjectKeyPropertyName(_objectKeyPropertyName);

                            _instance.addIgnoredProperties([_objectTypePropertyName, _objectKeyPropertyName, 'ExtensionData']);

                            if (canEvalOnDigest) {
                                digestWatchers.push({
                                    contextInstance: _instance,
                                    deregisterWatchFn: $rootScope.$watch(function () { _instance.evaluate(); })
                                });
                            }
                        }
                    }
                    else {
                        var context = new ObjectContext();

                        context.setServiceUri(_serviceUri);

                        context.setObjectTypePropertyName(_objectTypePropertyName);
                        context.setObjectKeyPropertyName(_objectKeyPropertyName);

                        context.addIgnoredProperties([_objectTypePropertyName, _objectKeyPropertyName, 'ExtensionData']);

                        if (canEvalOnDigest) {
                            digestWatchers.push({
                                contextInstance: context,
                                deregisterWatchFn: $rootScope.$watch(function () { _instance.evaluate(); })
                            });
                        }

                        return context;
                    }

                    return _instance;
                };

                /**
                 * Returns a ObjectContext instance. If we are set to only allow
                 * a single instance, that instance will be returned. Otherwise,
                 * a new instance will be created and returned.
                 *
                 * The default value for evalOnDigest is true.
                 * 
                 * @param {boolean=} evalOnDigest Optional value that determines whether or not the context will automatically watch for changes.
                 */
                var _getInstance = function (canEvalOnDigest) {
                    canEvalOnDigest = typeof canEvalOnDigest !== 'undefined' ? !!canEvalOnDigest : true;
                    return _instance || this.create(canEvalOnDigest);
                };

                /**
                 * Searchs the array of registered $digest watcher entries, and 
                 * will deregister the one that is tied to the current context.
                 * 
                 * @param {object} contextInstance An ObjectContext instance.
                 */
                var _stopAutoWatch = function (contextInstance) {
                    for (var i = digestWatchers.length - 1; i >= 0; i--) {
                        if (digestWatchers[i].contextInstance === contextInstance && digestWatchers[i].deregisterWatchFn) {
                            digestWatchers[i].deregisterWatchFn();
                            digestWatchers.splice(i, 1);
                        }
                    }
                };

                /**
                 * Register a $digest listener for this context, and attach the 
                 * ObjectContext.evaluate() function to it.
                 * 
                 * @param {object} contextInstance An ObjectContext instance.
                 */
                var _startAutoWatch = function (contextInstance) {
                    if (!contextInstance) {
                        throw new Error('Invalid context instance specified.');
                    }

                    var entryExists = false;

                    for (var i = 0; i < digestWatchers.length; i++) {
                        if (digestWatchers[i].contextInstance === contextInstance) {
                            entryExists = true;
                        }
                    }

                    if (!entryExists && contextInstance.evaluate) {
                        digestWatchers.push({
                            contextInstance: contextInstance,
                            deregisterWatchFn: $rootScope.$watch(function () { contextInstance.evaluate() })
                        });
                    }
                };

                /**
                 * Caches a list of types in the _typeCache.
                 */
                var _cacheTypes = function (types, identifierPropertyName) {
                    _typeIdentifierPropertyName = identifierPropertyName;
                    _typeCache = _typeCache.concat(types);
                };

                /**
                 * Fetches a type from the type cache using the requested type string.
                 */
                var _getTypeInstance = function(requestedType) {
                    for (var i=0; i<_typeCache.length; i++) {
                        var obj = _typeCache[i];

                        if (obj.hasOwnProperty(_typeIdentifierPropertyName) && obj[_typeIdentifierPropertyName] === requestedType) {
                            var instance = angular.copy(obj);
                            delete instance[_typeIdentifierPropertyName];
                            return instance;
                        }
                    }

                    return null;
                };

                return {
                    create: _create,
                    getInstance: _getInstance,
                    stopAutoWatch: _stopAutoWatch,
                    startAutoWatch: _startAutoWatch,
                    cacheTypes: _cacheTypes,
                    getTypeInstance: _getTypeInstance,
                    haveTypesBeenLoaded: function() { return _typeCache.length > 0; }
                };

            }
        ];

    });
})(window.angular);
