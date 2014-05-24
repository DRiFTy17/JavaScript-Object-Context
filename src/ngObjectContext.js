(function() {
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
    angular.module('ngObjectContext', []).provider('objectContext', function() {

        /**
         * This flag allows the context to be configured to only allow one instance
         * if set to true.
         * 
         * @private
         */
        var _isSingleton = true;

        /**
         * This will hold the one singleton instance of this class if '_isSingleton'
         * is set to true.
         * 
         * @private
         */
        var _instance = null;

        /**
         * The endpoint URI to point to when invoking submit/load requests.
         * 
         * @private
         */
        var _endpointUri = null;

        /**
         * Call this with true to restrict the context creation to one instance. If
         * set false is passed (the default value) then any calls to create a new
         * context, will generate a new instance.
         * 
         * @public
         */
        this.restrictToSingleContext = function(restrict) {
            _isSingleton = restrict;
        };

        /**
         * This is the endpoint that is used when sending requests to the server.
         * 
         * @public
         */
        this.setEndpointUri = function(uri) {
            _endpointUri = uri.trim();
        };

        /**
         * The domain context factory function.
         */
        this.$get = ['$rootScope', '$q', '$http',
            function($rootScope, $q, $http) {

                return {
                    /**
                     * Creates a new ObjectContext instance. If true is passed, then a $digest
                     * watch is created, and any digest calls will evaluate our tracked objects
                     * for changes.
                     *
                     * If we were configured to only one instance of a context, then that will
                     * be returned if it exists.
                     * 
                     * @param {boolean=} evalOnDigest Optional value that determines whether or not the context will automatically watch for changes.
                     */
                    create: function(evalOnDigest) {
                        evalOnDigest = typeof evalOnDigest !== 'undefined' ? !!evalOnDigest : true;
                        
                        if (_isSingleton) {
                            _instance = _instance || new ObjectContext($rootScope, $q, $http, evalOnDigest, _endpointUri);
                            return _instance;
                        }

                        return new ObjectContext($rootScope, $q, $http, evalOnDigest, _endpointUri);
                    },
                    /**
                     * Returns a ObjectContext instance. If we are set to only allow
                     * a single instance, that instance will be returned. Otherwise,
                     * a new instance will be created and returned.
                     *
                     * The default value for evalOnDigest is true.
                     * 
                     * @param {boolean=} evalOnDigest Optional value that determines whether or not the context will automatically watch for changes.
                     */
                    getInstance: function(evalOnDigest) {
                        evalOnDigest = typeof evalOnDigest !== 'undefined' ? !!evalOnDigest : true;
                        return _instance || this.create(evalOnDigest);
                    }
                };

            }
        ];

    });

    /**
     * A generic exception that takes in a custom error message. 
     *
     * @param {string} message The error message to display.
     */
    function ObjectContextException(message) {
        return ObjectContext.prototype.stringFormat('{0}: {1}', 'ObjectContextException', message);
    }

    /**
     * Creates a new instance of an ObjectContext.
     * 
     * @constructor 
     * @param {object} rootScope A reference to the AngularJS $rootScope service.
     * @param {object} q A reference to the AngularJS $q service.
     * @param {object} http A reference to the AngularJS $http service.
     * @param {boolean} evalOnDigest Whether or not to evaluate changes when the AngularJS $digest loop runs.
     * @param {string} uri A URI to map HTTP requests to.
     */
    function ObjectContext(rootScope, q, http, evalOnDigest, uri) {
        var self = this;

        /**
         * The available object types for loaded objects.
         * 
         * @public
         */
        this.ObjectStatus = {
            New: 'New',
            Unmodified: 'Unmodified',
            Modified: 'Modified',
            Deleted: 'Deleted'
        };

        /**
         * This is a flag that can be queried and used to know if an async request
         * operation is currently in progress.
         * 
         * @public
         */
        this.isLoading = false;

        /**
         * A flag that can be queried and used to know if an async submit operation is in progress
         * 
         * @public
         */
        this.isSubmitting = false;

        /**
         * The URI to request when executing requests to the server.
         * 
         * @private
         */
        this._endpointUri = uri;

        /**
         * Add a reference to the Angular $rootScope so we can add digest watches.
         * 
         * @private
         */
        this._rootScope = rootScope;

        /**
         * Add a reference to the Angular $q service for promises.
         * 
         * @private
         */
        this._q = q;

        /**
         * Add a reference to the Angular $http service for HTTP requests.
         * 
         * @private
         */
        this._http = http;

        /**
         * This stores the tracked objects.
         * 
         * @private
         */
        this._objectMap = [];

        /**
         * A collection of change listeners that are subscribed to listen for changes.
         * 
         * @private
         */
        this._changeListeners = [];

        /**
         * This is used to tell our digest watcher if it should call evaluate whenever
         * that event occurs.
         * 
         * @private
         */
        this._autoEvaluate = !! evalOnDigest;

        /**
         * Watch for calls to $digest. When that occurs, we need to evaluate our
         * tracked objects for changes.
         * 
         * @private
         */
        this._offDigestWatch = null;

        // Check to see if we need to set up a digest watch now
        if (this._autoEvaluate) {
            this._offDigestWatch = this._rootScope.$watch(function() {
                if (self._autoEvaluate && self._objectMap.length > 0) {
                    self.evaluate();
                }
            });
        }
    }

    /**
     * Subcribes the passed listener function that will be invoked when a change has occured.
     * 
     * @param {function} listener A function to invoke when a change occurs to any objects in the context.
     */
    ObjectContext.prototype.subscribeChangeListener = function(listener) {
        if (typeof listener !== 'function') {
            throw ObjectContextException('The provided listener must be a function callback.');
        }
        
        this._changeListeners.push(listener);
    };

    /**
     * Unsubscribes the provided change listener.
     * 
     * @param {function} listener A function reference to unsubscribe.
     */
    ObjectContext.prototype.unsubscribeChangeListener = function(listener) {
        if (this._changeListeners.indexOf(listener) < 0) {
            throw ObjectContextException('The provided listener function was not subscribed.');
        }
        
        this._changeListeners.splice(this._changeListeners.indexOf(listener), 1);
    };

    /**
     * Adds an object to the context. Any changes to the properties on this object
     * will trigger the context to have changes and notify any subscribers.
     *
     * This method wraps the passed in object in an object that we can work with. The
     * passed in object will be copied so we can store its original state.
     *
     * If a meta property does not exist on the object then one will be added to it.
     *
     * Any changes that are made to this object can be seen by querying the changeset
     * property.
     * 
     * @param {object} obj An object to add to the context that will be tracked for changes.
     * @param {object} parent The root parent of obj.
     * @param {boolean} isStatusNew Whether or not this object should be added with a status of 'New' or not.
     */
    ObjectContext.prototype.add = function(obj, parent, isStatusNew) {
        // Restrict passed in values to be an object
        if (typeof obj !== 'object' || obj instanceof Array) {
            throw ObjectContextException('Invalid object specified. The value provided must be of type "object".');
        }
        
        if (this._doesObjectExist(obj)) {
            throw ObjectContextException('Object already exists in the context.');
        }

        if (!obj._objectMeta) {
            obj._objectMeta = {
                status: isStatusNew ? this.ObjectStatus.New : this.ObjectStatus.Unmodified,
                type: 'Object'
            };
        } 
        else if (!obj._objectMeta.status) {
            obj._objectMeta.status = this.ObjectStatus.Unmodified;
        }
        else if (!obj._objectMeta.type) {
            obj._objectMeta.type = 'Object';
        }
        
        if (obj._objectMeta.status !== this.ObjectStatus.New &&
            obj._objectMeta.status !== this.ObjectStatus.Unmodified &&
            obj._objectMeta.status !== this.ObjectStatus.Modified &&
            obj._objectMeta.status !== this.ObjectStatus.Deleted) {
            throw ObjectContextException(this.stringFormat('Invalid object status: {0}', obj._objectMeta.status));
        }

        this._objectMap.push(this._createMappedObject(obj, parent));
        this._addChildren(obj, parent, isStatusNew);
    };

    /**
     * Find any children on the provided object that can be added to context.
     * 
     * @param {object} obj
     * @param {parent} parent
     * @param {boolean} isStatusNew Whether or not this object should be added with a status of 'New' or not.
     */
    ObjectContext.prototype._addChildren = function(obj, parent, isStatusNew) {
        // Check to see if there are any child objects that need to be added to
        // the context. This includes arrays of objects as well.
        for (var property in obj) {
            if (!this._isTrackableProperty(obj, property)) {
                continue;
            }
            
            if (obj[property] instanceof Array) {
                this._addArray(obj[property], parent || obj, isStatusNew);
            }
            else if (typeof obj[property] === 'object') {
                if (this._doesObjectExist(obj[property])) {
                    continue;
                }
                
                this.add(obj[property], parent || obj, isStatusNew);
            }
        }
    };

    /**
     * Takes the pased array and adds each of its elements to the the context.
     * 
     * If an element is an array, it will recurse.
     * 
     * @param {array} ary The array to add to the context.
     * @param {boolean} isStatusNew Whether or not this object should be added with a status of 'New' or not.
     */
    ObjectContext.prototype._addArray = function(ary, parent, isStatusNew) {
        if (!(ary instanceof Array)) {
            throw ObjectContextException('An array must be specified.');
        }
        
        for (var i=0; i<ary.length; i++) {
            if (typeof ary[i] === 'function') {
                continue;
            }
            
            if (ary[i] instanceof Array) {
                this._addArray(ary[i], parent, isStatusNew);
            }
            else if (typeof ary[i] === 'object') {
                if (this._doesObjectExist(ary[i])) {
                    continue;
                }
                
                this.add(ary[i], parent, isStatusNew);
            }
            else {
                throw ObjectContextException(this.stringFormat('Invalid array item type found ("{0}") at index {1}.', typeof ary[i], i));
            }
        }
    };

    /**
     * Determines if the passed property exists on the object, is not a function,
     * and doesn't start with a reserved character. If all of those are false, then
     * the property can be tracked.
     * 
     * @param {object} obj The object to check the property against.
     * @param {string} property The property to check.
     * @returns {boolean} True if the property can be tracked, false otherwise.
     */
    ObjectContext.prototype._isTrackableProperty = function(obj, property) {
        if (!obj.hasOwnProperty(property) || 
            typeof obj[property] === 'function' ||
            property.toString().substring(0, 1) === '_' || 
            property.toString().substring(0, 1) === '$') {
            return false;
        }
        
        return true;
    };

    /**
     * A helper function to create a mapped context object.
     * 
     * This will wrap the passed in object, and add any necessary properties to 
     * aid in the change tracking process.
     * 
     * @param {object} obj An object to wrap.
     */
    ObjectContext.prototype._createMappedObject = function(obj, parent) {
        var self = this;
        
        return {
            /**
             * The current state of the object.
             */
            current: obj,
            /**
             * A copy of the object in its unchanged state.
             */
            original: angular.copy(obj),
            /**
             * Returns whether or not the current object has changes from its
             * original state.
             * 
             * @returns {boolean} True if the object has changes from its original state, false otherwise.
             */
            hasChanges: function() {
                return this.changeset.length > 0 ||
                       this.current._objectMeta.status === self.ObjectStatus.New ||
                       this.current._objectMeta.status === self.ObjectStatus.Modified ||
                       this.current._objectMeta.status === self.ObjectStatus.Deleted;
            },
            /**
             * An array holding the changes to the current object.
             */
            changeset: [],
            /**
             * A reference to the root object that this object is a child of.
             * If this is the parent, then the value is null.
             */
            parent: parent
        };
    };

    /**
     * Checks to see if the provided object has already been added to the context.
     * 
     * @param {object} objectReference An object to test for existance.
     */
    ObjectContext.prototype._doesObjectExist = function(objectReference) {
        for (var i = 0; i < this._objectMap.length; i++) {
            if (this._objectMap[i].current === objectReference) {
                return true;
            }
        }

        return false;
    };

    /**	
     * Deletes an existing object from change tracking and all objects that are a
     * child of the provided object.
     * 
     * @param {object} obj An object to delete.
     * @param {boolean} hardDelete Whether or not to remove the object from the context, or just mark it for deletion.
     */
    ObjectContext.prototype.delete = function(obj, hardDelete) {
        var index = this._getMapIndex(obj);

        if (index === null) {
            throw ObjectContextException('Object was not found. Removal failed.');
        }

        // Are we removing the object or just marking it as deleted
        if (hardDelete === true) {
            this._objectMap.splice(index, 1);
        }
        else {
            this._objectMap[index].current._objectMeta.status = this.ObjectStatus.Deleted;
        }

        // Remove all objects that are a child of this object
        for (var i=this._objectMap.length-1; i>=0; i--) {
            var currentObject = this._objectMap[i];
            
            if (currentObject.current === obj) {
                continue;
            }
            
            if (currentObject.parent === obj) {
                if (hardDelete === true) {
                    this._objectMap.splice(i, 1);
                }
                else {
                    currentObject.current._objectMeta.status = this.ObjectStatus.Deleted;
                }
            }
        }

        this.evaluate();
    };

    /**	
     * Removes all existing objects from the context.
     * 
     * @param {boolean} hardRemove Whether or not to remove all objects from the context, or just mark them for deletion.
     */
    ObjectContext.prototype.removeAll = function(hardRemove) {
        if (hardRemove === true) {
            this._objectMap = [];
        }
        else {
            for (var i=0; i<this._objectMap.length; i++) {
                this._objectMap[i].current._objectMeta.status = this.ObjectStatus.Deleted;
            }
        }
        
        this.evaluate();
    };

    /**
     * Returns the index of an existing object in the object map.
     * 
     * @param {object} obj An existing object to search for.
     */
    ObjectContext.prototype._getMapIndex = function(obj) {
        for (var i=0; i<this._objectMap.length; i++) {
            if (this._objectMap[i].current === obj) {
                return i;
            }
        }

        return null;
    };

    /**
     * Returns a copy of the original unchanged object in the state that it was in 
     * when it was either added or last saved. 
     * 
     * If the object is not found then null is returned.
     * 
     * @param {object} objectReference The object to search for.
     * @returns {object|null} A copy of the original object, or null if not found.
     */
    ObjectContext.prototype.getOriginal = function(objectReference) {
        for (var i = 0; i < this._objectMap.length; i++) {
            if (this._objectMap[i].current === objectReference) {
                return angular.copy(obj.original);
            }
        }

        return null;
    };

    /**
     * Returns the mapped object instance using the provided object reference.
     * 
     * @param {object} obj The object to search for.
     * @returns {object} A mapped object.
     */
    ObjectContext.prototype._getMappedObject = function(obj) {
        var mappedObjectIndex = this._getMapIndex(obj);

        if (mappedObjectIndex === null) {
            throw ObjectContextException(this.stringFormat('Invalid object index: {0}', mappedObjectIndex));
        }

        return this._objectMap[mappedObjectIndex];
    };

    /**
     * Gets an object status for the specified object reference.
     * 
     * @param {object} obj The object to search for.
     * @returns {string} The status of the requested object.
     */
    ObjectContext.prototype.getObjectStatus = function(obj) {
        if (!obj) {
            throw ObjectContextException('Invalid object provided.');
        }

        var mappedObjectIndex = this._getMapIndex(obj);

        if (mappedObjectIndex === null) {
            throw ObjectContextException(this.stringFormat('Invalid object index: {0}', mappedObjectIndex));
        }

        return this._objectMap[mappedObjectIndex].current._objectMeta.status;
    };

    /**
     * This is the change tracking engine.
     *
     * Checks if any of the property values in each of the tracked objects have any changes.
     *
     * Will recursively evaluate child properties that are arrays/objects themselves.
     */
    ObjectContext.prototype.evaluate = function() {        
        // Loop through each of the objects currently loaded, and evaluate them for
        // changes. If the object is marked as deleted/new, then it will be skipped as 
        // we already know that there are changes.
        for (var i=0; i<this._objectMap.length; i++) {
            var mappedObj = this._objectMap[i];

            // If the object is marked as deleted then we can skip it
            if (mappedObj.current._objectMeta.status === this.ObjectStatus.Deleted) {
                continue;
            }

            // First we need to check if there are any new objects to add from 
            // any arrays within the hierarchy of the currently mapped
            this._addChildren(mappedObj.current, mappedObj.parent, true);

            this._checkForChanges(mappedObj);
        }
console.log(this._objectMap);
        // Now that the evaluate loop has finished, call any change listeners subscribed to us
        for (var x = 0; x < this._changeListeners.length; x++) {
            var listener = this._changeListeners[x];

            if (listener && typeof listener === 'function') {
                listener(this.hasChanges());
            }
        }
    };
    
    /**
     * Checks to see if this mapped object has any properties in the current 
     * object that have changed from the original.
     * 
     * Any functions/private properties are skipped. Any object/arrays are skipped
     * because those will be evaluated at a later time.
     * 
     * @param {object} obj The mapped object to evaluate for changes.
     */
    ObjectContext.prototype._checkForChanges = function(obj) {
        for (var property in obj.current) {
            // Skip private/angular/array/object properties
            if (!this._isTrackableProperty(obj.current, property)) {
                continue;
            }

            // If this property is an array then check to see if the length has changed.
            // Otherwise just compare the properties values
            if (obj.current[property] instanceof Array) {
                if (!(obj.original[property] instanceof Array)) {
                    throw ObjectContextException('Property type ("Array") has been modified from the original type.');
                }
                
                if (obj.current[property].length !== obj.original[property].length) {
                    this._setPropertyChanged(obj, property);
                }
            }
            else if (typeof obj.current[property] !== 'object' && obj.current[property] !== obj.original[property]) {
                this._setPropertyChanged(obj, property);
            }
        }
    };

    /**
     * Adds an object to the changeset if it doesn't already exist. If it does
     * exist then it the current value on that changeset record is updated with
     * the new current value.
     * 
     * @param {object} obj The mapped object to update.
     * @param {string} property The property that was changed.
     */
    ObjectContext.prototype._setPropertyChanged = function(obj, property) {
        // Check if this property has already been added to the changeset
        var existingChangeEntry = null;
        for (var i=0; i<obj.changeset.length; i++) {
            if (obj.changeset[i].propertyName === property.toString()) {
                existingChangeEntry = obj.changeset[i];
                break;
            }
        }

        if (existingChangeEntry !== null) {
            // Update the existing changeset entry current value
            existingChangeEntry.currentValue = obj.current[property];
        }
        else {
            // Add a new changeset entry
            obj.changeset.push({
                propertyName: property.toString(),
                originalValue: obj.original[property],
                currentValue: obj.current[property]
            });

            // Update the object status to modified only if it is currently unmodified
            if (obj.current._objectMeta.status === this.ObjectStatus.Unmodified) {
                obj.current._objectMeta.status = this.ObjectStatus.Modified;
            }
        }
    };

    /**
     * Revert changes for one specific object back to its original state.
     * 
     * @param {object} obj The object that we are reverting the changes for.
     */
    ObjectContext.prototype.revert = function(obj) {
        if (!obj) {
            throw ObjectContextException('Invalid object provided.');
        }
        
        var itemIndex = this._getMapIndex(obj);

        if (itemIndex === null) {
            throw ObjectContextException('Could not determine object index. Revert changes failed.');
        }

        this._resetObject(this._objectMap[itemIndex]);
        this.evaluate();
    };

    /**
     * Revert changes for all tracked objects back to their original state.
     */
    ObjectContext.prototype.revertAll = function() {
        for (var i=0; i<this._objectMap.length; i++) {
            this._resetObject(this._objectMap[i]);
        }

        this.evaluate();
    };

    /**
     * Removes any changes to a loaded object and reverts it to its unchanged state.
     * 
     * @param {object} obj The mapped to reset.
     */
    ObjectContext.prototype._resetObject = function(obj) {
        if (!obj) {
            throw ObjectContextException('Invalid object provided.');
        }

        // Revert all the changes in the changeset for this object back their original values
        for (var i=0; i<obj.changeset.length; i++) {
            var property = obj.changeset[i].propertyName;
            
            if (!(obj.current[property] instanceof Array)) {
                obj.current[property] = obj.original[property];
            }
            else {
                for (var x=obj.current[property].length-1; x>=0; x--) {
                    if (obj.current[property][x]._objectMeta.status === this.ObjectStatus.New) {
                        obj.current[property].splice(x, 1);
                    }
                }
            }
        }
        
        obj.current._objectMeta.status = obj.original._objectMeta.status;
        obj.changeset = [];
        
        // Now check for any objects that are a child of this object (if it is a parent)
        if (!obj.parent) {
            for (var j=this._objectMap.length-1; j>=0; j--) {
                var currentObject = this._objectMap[j];
                
                if (currentObject === obj) {
                    continue;
                }
                
                // Remove this object from the context if it is marked as 'New'
                if (currentObject.current._objectMeta.status === this.ObjectStatus.New) {
                    this._objectMap.splice(j, 1);
                }
                else if (currentObject.current._objectMeta.status === this.ObjectStatus.Deleted) {
                    currentObject.current._objectMeta.status = this.original._objectMeta.status;
                }
                else if (currentObject.parent === obj.current) {
                    this._resetObject(currentObject);
                }
            }
        }
    };

    /**
     * Determines if any of the tracked objects have any active changesets.
     * 
     * @returns {boolean} Determines whether or not the context has any objects with changes.
     */
    ObjectContext.prototype.hasChanges = function() {
        for (var i=0; i<this._objectMap.length; i++) {
            if (this._objectMap[i].hasChanges()) {
                return true;
            }
        }

        return false;
    };

    /**
     * Removes all currently tracked objects and resets the state of the context.
     *
     * This will usually be called when the state of the application is being destroyed,
     * and any object that are laoded into the context are no longer relevant.
     */
    ObjectContext.prototype.clear = function() {
        this._objectMap = [];
        this._changeListeners = [];
    };

    /**
     * Returns the changeset for a specified mapped object reference.
     * 
     * @param {object} obj The object to check for changes against.
     * @returns {object} An object with the properties that have changed on the current object.
     */
    ObjectContext.prototype.getChangeset = function(obj) {
        if (!obj) {
            throw ObjectContextException('Could not fetch changeset. Invalid object provided.');
        }
        
        var mappedObject = this._getMappedObject(obj);

        if (!mappedObject) {
            throw ObjectContextException('The object could not be found.');
        }

        return mappedObject.changeset;
    };

    /**
     * Used for turning on and off automatic change tracking if set to true.
     * 
     * @param {boolean} canEval True or false value to turn on auto evaluating or not.
     */
    ObjectContext.prototype.setAutoEvaluate = function(canEval) {
        var self = this;
        this._autoEvaluate = !!canEval;

        if (this._autoEvaluate && this._offDigestWatch === null) {
            this._offDigestWatch = this._rootScope.$watch(function() {
                if (self._autoEvaluate && self._objectMap.length > 0) {
                    self.evaluate();
                }
            });
        } 
        else if (!this._autoEvaluate && this._offDigestWatch) {
            this._offDigestWatch();
            this._offDigestWatch = null;
        }
    };

    /**
     * Attempts to fetch the requested type and load it into the context by
     * sending a GET request to the server for that type, along with optional
     * query parameters.
     * 
     * This GET request will be looking for a service method in the format of 'getType'.
     * 
     * Example:
     *     - Call: context.get('Person', {Id: 1});
     *     - Service method: 'getPerson(params)'
     * 
     * @param {string} type The type of object we are requesting.
     * @param {object} parameters The query parameters (optional);
     * @returns {object} An AngularJS promise.
     */
    ObjectContext.prototype.get = function(type, parameters) {
        var self = this;

        if (!parameters) {
            parameters = {};
        }

        if (!type || type.toString().trim().length === 0) {
            throw ObjectContextException('Invalid type specified.');
        }

        if (!this._endpointUri) {
            throw ObjectContextException('No endpoint URI specified.');
        }

        var deferred = this._q.defer();

        // TODO: Send request to load a specific object type. When the request returns
        //       we need to add it to the context.

        this.isLoading = true;

        // Check if we need to add a slash to the URI
        var separator = this._endpointUri.slice(-1) === '/' ? '' : '/';

        // this._http({ method: 'GET', url: this._endpointUri + separator + 'load' })
        // .success(function(data, status, headers, config) {
        //     self.add(data);
        //     self.evaluate();

        //     this.isLoading = false;

        //     deferred.resolve(data);
        // })
        // .error(function(data, status, headers, config) {
        //     deferred.reject(data);
        // });

        (function() {
            var newPerson = new Person(new Date().getTime(), "Brad", 51);
            newPerson._objectMeta.status = self.ObjectStatus.New;
            self.add(newPerson);
            self.isLoading = false;
            deferred.resolve(newPerson);
            self.evaluate();
        })();

        return deferred.promise;
    };

    /**
     * Sends a POST request with the current changes in the context to the server
     * to be saved.
     *
     * Take the current object in each tracked object, and update its original value
     * and clear the changeset after the request has been completed.
     * 
     * @returns {object} An AngularJS promise.
     */
    ObjectContext.prototype.saveChanges = function() {
        var deferred = this._q.defer();

        // TODO: Send a submit request with the currently loaded objects. This will
        //       persist the objects based on their object status. When the request
        //       returns, refresh the context.

        this.isSubmitting = true;

        // this._http({ method: 'POST', url: this._endpointUri })
        // .success(function(data, status, headers, config) {

        // })
        // .error(function(data, status, headers, config) {
        //     deferred.reject(data);
        // });

        for (var i = this._objectMap.length - 1; i >= 0; i--) {
            var mappedObject = this._objectMap[i];

            // Check if we need to remove this object from the context
            if (mappedObject.current._objectMeta.status === this.ObjectStatus.Deleted) {
                this._objectMap.splice(i, 1);
                continue;
            }

            // This object was not removed so update its original values to be a copy of
            // the current values. Also, set its status to Unmodified.
            mappedObject.changeset = [];
            mappedObject.current._objectMeta.status = this.ObjectStatus.Unmodified;
            mappedObject.original = angular.copy(mappedObject.current);
        }

        this.evaluate();

        this.isSubmitting = false;
        deferred.resolve();

        return deferred.promise;
    };

    /**
     * Returns all objects in the context in their current state.
     * 
     * @returns {array} An Array of objects that exists in the context.
     */
    ObjectContext.prototype.getObjects = function() {
        var objects = [];

        for (var i = 0; i < this._objectMap.length; i++) {
            if (this._objectMap[i].current._objectMeta.status === this.ObjectStatus.Deleted) {
                continue;
            }

            objects.push(this._objectMap[i].current);
        }

        return objects;
    };

    /**
     * Attempts to find a single object in the context using the provided property.
     * 
     * @param {string} requestedType The type of objects to fetch from the context.
     * @returns {array} An array of objects found.
     */
    ObjectContext.prototype.getObjectsByType = function(requestedType) {
        var objects = [];

        for (var i = 0; i < this._objectMap.length; i++) {
            if (this._objectMap[i].current._objectMeta.type === requestedType) {
                objects.push(this._objectMap[i].current);
            }
        }

        return objects;
    };

    /**
     * Applies all changes in currently modified objects. After this, all objects
     * that previously had a status that was not equal to 'Unmodified', will now
     * have an 'Unmodified' status.
     * 
     * If the object has a status of deleted, then the object will be removed 
     * from the context.
     * 
     * Objects that were unchanged are not touched.
     */
    ObjectContext.prototype.applyChanges = function() {
        for (var i=this._objectMap.length-1; i>=0; i--) {
            var currentObject = this._objectMap[i];

            if (currentObject.current._objectMeta.status === this.ObjectStatus.Deleted) {
                this._objectMap.splice(i, 1);
            }
            else if (currentObject.current._objectMeta.status !== this.ObjectStatus.Unmodified) {
                currentObject.changeset = [];
                currentObject.current._objectMeta.status = this.ObjectStatus.Unmodified;
                currentObject.original = angular.copy(currentObject.current);
            }
        }
        
        this.evaluate();
    };

    /**
     * Gives us the ability to use placeholders in strings and replace their positions
     * with specified corresponding values.
     * 
     * @returns {string} A formatted string.
     */
    ObjectContext.prototype.stringFormat = function() {
        var s = arguments[0];

        for (var i = 0; i < arguments.length - 1; i++) {
            var reg = new RegExp("\\{" + i + "\\}", "gm");
            s = s.replace(reg, arguments[i + 1]);
        }

        return s;
    };
})();