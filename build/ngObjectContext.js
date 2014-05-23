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
     */
    ObjectContext.prototype.add = function(obj) {
        if (this._doesObjectExist(obj)) {
            throw ObjectContextException('Object already exists in the context.');
        }

        // Make sure this object has a metadata property. If not, then add it.
        if (!obj._objectMeta || !obj._objectMeta.status || !obj._objectMeta.type) {
            obj._objectMeta = {
                status: this.ObjectStatus.New,
                type: 'Object'
            };
        } else if (obj._objectMeta.status !== this.ObjectStatus.New &&
            obj._objectMeta.status !== this.ObjectStatus.Unmodified &&
            obj._objectMeta.status !== this.ObjectStatus.Modified &&
            obj._objectMeta.status !== this.ObjectStatus.Deleted) {
            throw ObjectContextException(this.stringFormat('Invalid object status: {0}', obj._objectMeta.status));
        }

        this._objectMap.push(this._createMappedObject(obj));
    };

    /**
     * A helper function to create a mapped context object.
     * 
     * This will wrap the passed in object, and add any necessary properties to 
     * aid in the change tracking process.
     * 
     * @param {object} obj An object to wrap.
     */
    ObjectContext.prototype._createMappedObject = function(obj) {
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
            changeset: []
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
     * Removes an existing object from change tracking.
     * 
     * @param {object} obj An object to remove.
     * @param {boolean} hardRemove Whether or not to remove the object from the context, or just mark it for deletion.
     */
    ObjectContext.prototype.remove = function(obj, hardRemove) {
        var index = this._getMapIndex(obj);

        if (index === null) {
            throw ObjectContextException('Object was not found. Removal failed.');
        }

        if (hardRemove === true) {
            this._objectMap.splice(index, 1);
        } 
        else {
            this._objectMap[index].current._objectMeta.status = this.ObjectStatus.Deleted;
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

            this._evalObject(mappedObj.current, mappedObj.current, '');
        }

        // Now that the evaluate loop has finished, call any change listeners subscribed to us
        for (var x = 0; x < this._changeListeners.length; x++) {
            var listener = this._changeListeners[x];

            if (listener && typeof listener === 'function') {
                listener(this.hasChanges());
            }
        }
    };

    /**
     * Recursively evaluates the properties on the provided object. Builds
     * up a string path to each property to determine its value.
     * 
     * @param {object} objectReference The parent object we are evaluating.
     * @param {object} obj The current object to evaluate for changes.
     * @param {string} path The current path to the property we are evaluating.
     */
    ObjectContext.prototype._evalObject = function(objectReference, obj, path) {
        for (var property in obj) {
            if (!obj.hasOwnProperty(property) || typeof obj[property] === 'function') {
                continue;
            }

            // Skip private/angular properties
            if (property.toString().substring(0, 1) === '_' || property.toString().substring(0, 1) === '$') {
                continue;
            }

            // Determine what to do based on the type of property we are evaluating
            // Evaluate arrays first, because typeof returns 'object' for arrays
            if (obj[property] instanceof Array) {
                this._evalArray(objectReference, obj[property], this.stringFormat('{0}["{1}"]', path, property));
            } 
            else if (typeof obj[property] === 'object') {
                this._evalObject(objectReference, obj[property], this.stringFormat('{0}["{1}"]', path, property));
            } 
            else {
                this._checkForChanges(objectReference, this.stringFormat('{0}["{1}"]', path, property));
            }
        }
    };

    /**
     * Recursively evaluates the elements of the passed in array, and tests
     * each value based on its type for any changes from its original state.
     * 
     * @param {object} objectReference The parent object we are evaluating.
     * @param {array} ary The current array to evaluate changes against.
     * @param {string} path The current path to the property we are evaluating.
     */
    ObjectContext.prototype._evalArray = function(objectReference, ary, path) {
        // First check the array lengths to see if they are different, if so 
        // then we have changes so stop
        var mappedObjectIndex = this._getMapIndex(objectReference);
        var mappedObject = this._getMappedObject(objectReference);

        var currentVal = eval('this._objectMap[' + mappedObjectIndex + '].current' + path);
        var originalVal = eval('this._objectMap[' + mappedObjectIndex + '].original' + path);

        if (!originalVal instanceof Array || !currentVal instanceof Array) {
            if (mappedObject.current._objectMeta.status === this.ObjectStatus.Unmodified) {
                mappedObject.current._objectMeta.status = this.ObjectStatus.Modified;
            }
            return;
        }
        else if (originalVal.length !== currentVal.length) {
            if (mappedObject.current._objectMeta.status === this.ObjectStatus.Unmodified) {
                mappedObject.current._objectMeta.status = this.ObjectStatus.Modified;
            }
            return;
        }

        for (var i=0; i<ary.length; i++) {
            if (typeof ary[i] === 'function') {
                continue;
            }

            if (typeof ary[i] === 'object') {
                this._evalObject(objectReference, ary[i], this.stringFormat('{0}[{1}]', path, i));
            } 
            else if (ary[i] instanceof Array) {
                this._evalArray(objectReference, ary[i], this.stringFormat('{0}[{1}]', path, i));
            } 
            else {
                this._checkForChanges(objectReference, this.stringFormat('{0}[{1}]', path, i));
            }
        }
    };

    /**
     * Determines if there are any changes to the current object.
     *
     * If a change is found, the property name will be added to the changeset.
     * 
     * @param {object} objectReference The parent object we are evaluating.
     * @param {string} property The current property name we are evaluating
     * @param {string} path The current path to the property we are evaluating.
     */
    ObjectContext.prototype._checkForChanges = function(objectReference, path) {
        var mappedObject = this._getMappedObject(objectReference);

        if (mappedObject === null) {
            throw ObjectContextException('Object not found.');
        }

        var mappedObjectIndex = this._getMapIndex(objectReference);

        try {
            // Get the current and original values using the path to the object
            var currentVal = eval('this._objectMap[' + mappedObjectIndex + '].current' + path);
            var originalVal = eval('this._objectMap[' + mappedObjectIndex + '].original' + path);

            // Create a path to use in the changeset. This will hold the absolute path
            // to any properties contained in the objects.
            var valuePath = this.stringFormat('[{0}]{1}', mappedObjectIndex, path);

            // If the current value is different than its original and this property
            // hasn't already been added to the changeset for this object, then add it.
            if (currentVal !== originalVal && mappedObject.changeset.indexOf(valuePath) < 0) {
                mappedObject.changeset.push(valuePath);

                // Update the object status to modified only if it is currently unmodified
                if (mappedObject.current._objectMeta.status === this.ObjectStatus.Unmodified) {
                    mappedObject.current._objectMeta.status = this.ObjectStatus.Modified;
                }
            }
        } 
        catch (e) {
            console.log(e, 'Unable to evaluate current or original values. checkForChanges() failed.');
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

        var item = this._resetObject(this._objectMap[itemIndex]);

        this.evaluate();
    };

    /**
     * Revert changes for all tracked objects back to their original state.
     */
    ObjectContext.prototype.revertAll = function() {
        for (var i = 0; i < this._objectMap.length; i++) {
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
        
        this._revertProperties(obj);
        this._restoreOriginal(obj);
        
        obj.current._objectMeta.status = obj.original._objectMeta.status;
        
        obj.changeset = [];
    };

    /**
     * Restores the provided mapped objects' current object value back to its
     * original state.
     * 
     * @param {object} mappedObject The mapped object to restore.
     */
    ObjectContext.prototype._restoreOriginal = function(mappedObject) {
        if (!mappedObject) {
            throw ObjectContextException('Invalid object provided.');
        }
        
        var obj = mappedObject.current;

        // Loop over the original objects properties
        for (var property in mappedObject.original) {
            if (typeof obj[property] === 'function') {
                continue;
            }
            
            // Skip private/angular properties
            if (property.toString().substring(0, 1) === '_' || property.toString().substring(0, 1) === '$') {
                continue;
            }
            
            // If this property doesn't exist on the current object, then it was removed so add it back in.
            if (!mappedObject.original.hasOwnProperty(property) && !mappedObject.current.hasOwnProperty(property)) {
                
            }

            // If the current value of this property is an array, then we need
            // to empty it, and add all the original values back in. This will
            // preserve the reference.
            if (obj[property] instanceof Array) {
                obj[property].length = 0;
                Array.prototype.push.apply(obj[property], angular.copy(mappedObject.original[property]));
            }
        }
    };

    /**
     * Returns the values of all properties in all objects to their original values.
     * References are left alone, only values are reverted.
     * 
     * @param {obj} item The mapped object to return to its original state.
     */
    ObjectContext.prototype._revertProperties = function(item) {
        if (!item) {
            throw ObjectContextException('Invalid object provided.');
        }

        // If this object doesn't have anything in the changeset then there is nothing
        // to revert to.
        if (!item.changeset || item.changeset.length === 0) {
            return;
        }

        // Loop over the changeset and revert the properties using the path to each property
        for (var i=0; i<item.changeset.length; i++) {
            var change = item.changeset[i];
            var secondBracketPosition = change.indexOf(']');

            try {
                // This is here so we can add the "original" or "current" property text names
                // to the paths of each property.
                var objectMapIndexPath = change.substring(0, secondBracketPosition + 1);
                var changePath = change.substring(secondBracketPosition + 1, change.length);

                // Create the paths to the current and original properties
                var currentProperty = this.stringFormat('this._objectMap{0}["current"]{1}', objectMapIndexPath, changePath);
                var originalProperty = this.stringFormat('this._objectMap{0}["original"]{1}', objectMapIndexPath, changePath);

                // Use eval to reset the path to the property since we support any level of properties in an object
                eval(this.stringFormat('{0} = {1}', currentProperty, originalProperty));
            } 
            catch (e) {
                console.log(e, 'Unable to evaluate current or original values. revertProperties() failed.');
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
            throw ObjectContextException('Invalid object provided.');
        }
        
        var self = this;
        var changes = {};

        var mappedObjectIndex = this._getMapIndex(obj);
        
        if (mappedObjectIndex === null) {
            throw ObjectContextException('Invalid object index.');
        }
        
        var mappedObject = this._getMappedObject(obj);

        if (!mappedObject) {
            throw ObjectContextException('The object could not be found.');
        }

        // Add each changed property to the changes object
        for (var i = 0; i < mappedObject.changeset.length; i++) {
            var changePath = mappedObject.changeset[i];
            var changedProperty = changePath.replace('["', '').replace('"]', '');

            try {
                var secondBracketPosition = changePath.indexOf(']');

                var objectMapIndexPath = changePath.substring(0, secondBracketPosition + 1);
                var newChangePath = changePath.substring(secondBracketPosition + 1, changePath.length);

                var currentVal = eval(this.stringFormat('this._objectMap{0}["current"]{1}', objectMapIndexPath, newChangePath));
                var originalVal = eval(this.stringFormat('this._objectMap{0}["original"]{1}', objectMapIndexPath, newChangePath));

                changes[changedProperty] = {
                    original: originalVal,
                    current: currentVal
                };

                // // Add this property to the changes objects
                // var pathAry = newChangePath.replace(/\]\[/gi, "],[").split(',');

                // // Create clean strings from each path name
                // for (var x=0; x<pathAry.length; x++) {
                //   pathAry[x] = pathAry[x].replace('["', '').replace('"]', '');
                // }

                // var previousPathProperty = null;

                // for (var j=0; j<pathAry.length; j++) {
                //   var currentPathProperty = pathAry[j];

                //   // Determine if this is an array index or property name
                //   var isArrayIndex = !isNaN(currentPathProperty);

                //   if (isArrayIndex) {
                //     if (Object.keys(changes[previousPathProperty]).length === 0) {
                //       changes[previousPathProperty] = [{}];
                //     }
                //     else {
                //       changes[previousPathProperty][parseInt(currentPathProperty)] = {};
                //     }
                //   }
                //   else {
                //     if (!isNaN(previousPathProperty)) {
                //       //changes[]
                //     }
                //     else {
                //       changes[currentPathProperty] = {};
                //     }
                //   }

                //   previousPathProperty = currentPathProperty;
                // }
            } catch (e) {
                console.log(e, 'Unable to evaluate current or original values. getChangeset() failed.');
                return {};
            }
        }

        return changes;
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
     * Objects that were unchanged are not touched.
     */
    ObjectContext.prototype.applyChanges = function() {
        for (var i = 0; i < this._objectMap.length; i++) {
            var currentObject = this._objectMap[i];

            if (currentObject.current._objectMeta.status !== this.ObjectStatus.Unmodified) {
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