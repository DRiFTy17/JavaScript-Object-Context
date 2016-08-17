(function () {
    'use strict';

    /**
     * Creates a new instance of an ObjectContext.
     * 
     * @constructor
     */
    function ObjectContext() {
        var self = this;

        /**
         * This stores the tracked objects.
         * 
         * @private
         * @type Array
         */
        var _objectMap = [];

        /**
         * A collection of change listeners that are subscribed to listen for changes.
         * 
         * @private
         * @type Array
         */
        var _changeListeners = [];

        /**
         * Holds the URI to use during load requests. 
         *
         * @private
         * @type string
         */
        var _serviceUri = null;

        /**
         * This is an array of property names to ignore if they exist on loaded objects.
         *
         * @private
         * @type Array
         */
        var _ignoredProperties = [];

        /**
         * The property name to look for on objects to retrive its data type.
         *
         * @private
         * @type string
         */
        var _objectTypePropertyName = null;

        /**
         * The property name to look for on objects to retrive its key.
         *
         * @private
         * @type Array
         */
        var _objectKeyPropertyName = null;

        /**
         * This is the last used identifier value for objects loaded into the context.
         * 
         * @private
         * @type Integer
         */
        var _lastIdentifier = 0;

        /**
         * Creates a deepy copy of the passed in object.
         * 
         * Note: The copy is done through the JavaScript JSON object, and doesn't copy
         * any functions that exists in the object. This includes auto getters/setters.
         * 
         * @private
         * @param {object} obj The object to copy.
         * @returns {object} A deep copy of the object.
         */
        var _deepCopy = function (obj) {
            return JSON.parse(JSON.stringify(obj));
        };

        /**
         * Gives us the ability to use placeholders in strings and replace their positions
         * with specified corresponding values.
         * 
         * @private
         * @returns {string} A formatted string.
         */
        var _stringFormat = function () {
            var s = arguments[0];

            for (var i = 0; i < arguments.length - 1; i++) {
                var reg = new RegExp('\\{' + i + '\\}', 'gm');
                s = s.replace(reg, arguments[i + 1]);
            }

            return s;
        };

        /**
         * Determines if the provided object has any changes to it.
         * 
         * @private
         * @param {object} obj The object to test for changes.
         * @returns {boolean}
         */
        var _doesObjectHaveChanges = function (obj) {
            return obj.changeset.length > 0 ||
                   obj.status === ObjectContext.ObjectStatus.Added ||
                   obj.status === ObjectContext.ObjectStatus.Modified ||
                   obj.status === ObjectContext.ObjectStatus.Deleted;
        };

        /* jshint ignore:start */
        /**
         * Updates every loaded object with a new internal sequence number identifier.
         * @private
         */
        var _updateIdentifiers = function () {
            _lastIdentifier = 0;

            for (var i = 0; i < _objectMap.length; i++) {
                _objectMap.identifier = ++_lastIdentifier;
            }
        };
        /* jshint ignore:end */

        /**
         * A helper function to create a mapped context object.
         * 
         * This will wrap the passed in object, and add any necessary properties to 
         * aid in the change tracking process.
         * 
         * @private
         * @param {object} obj An object to wrap.
         * @param {object} status The status of the object.
         * @param {object} type The type of the object.
         * @param {object} rootParent The root parent that this object is in the hierarchy of.
         * @param {object} parent The direct parent of this object.
         * @param {string} propertyName The property name on the parent that holds this object.
         */
        var _createMappedObject = function(obj, status, type, rootParent, parent, propertyName) {
            // Find all properties on this object that are Date instances and keep
            // track of them so we can retain their types in the original copy.
            var dateProperties = _getDateProperties(obj);

            var mappedObject = {
                /**
                 * The current state of the object.
                 * @private
                 */
                current: obj,
                /**
                 * A copy of the object in its unchanged state.
                 * @private
                 */
                original: _deepCopy(obj),
                /**
                 * Returns whether or not the current object has changes from its
                 * original state.
                 *
                 * @private
                 * @returns {boolean} True if the object has changes from its original state, false otherwise.
                 */
                hasChanges: function () {
                    var hasChanges = _doesObjectHaveChanges(this);

                    // Reset has child changes before rechecking
                    this.hasChildChanges = false;

                    // Check if this object has any children that have changes
                    for (var i = 0; i < _objectMap.length; i++) {
                        var currentObject = _objectMap[i];

                        if (currentObject === this) { continue; }

                        if (currentObject.rootParent === this.current || currentObject.parent === this.current) {
                            if (_doesObjectHaveChanges(currentObject)) {
                                this.hasChildChanges = true;
                                break;
                            }
                        }
                    }

                    return hasChanges;
                },
                /**
                 * An array holding the changes to the current object.
                 * @private
                 */
                changeset: [],
                /**
                 * A reference to the root object that this object is a child of.
                 * If this is the parent, then the value is null.
                 * @private
                 */
                rootParent: rootParent,
                /**
                 * A reference to the direct parent object of this object.
                 * @private
                 */
                parent: parent,
                /**
                 * Contains the property name on the parent that holds this object.
                 * @type {string}
                 */
                propertyName: propertyName,
                /**
                 * Identifies if this object has any child objects that are changed.
                 * @private
                 */
                hasChildChanges: false,
                /**
                 * Holds the current status of the object we are tracking
                 * @private
                 */
                status: status,
                /**
                 * Holds the original status of the object we are tracking
                 * @private
                 */
                originalStatus: status,
                /**
                 * The type of the object we are tracking
                 * @private
                 */
                type: type,
                /**
                 * Look at the ObjectKeys property to get the keys of the object.
                 * @private
                 */
                key: _objectKeyPropertyName && _objectKeyPropertyName.trim().length > 0 && obj.hasOwnProperty(_objectKeyPropertyName) ? obj[_objectKeyPropertyName] : null,
                /**
                 * This is the internal unique object identifier. All objects loaded into the 
                 * context will have a unique sequence number assigned to them
                 * @private
                 */
                identifier: ++_lastIdentifier
            };

            // After the mapped object has been created, we need to go through all
            // properties that we found previously that were Date objects and create
            // new Date instances using their ISO-8601 string formats from the deep
            // copy. This will let us know later which types to use when cancelling
            // or when accepting changes.
            if (dateProperties.length) {
                _instantiateDateProperties(dateProperties, mappedObject.original);
            }

            return mappedObject;
        };

        /**
         * Determines if the passed property exists on the object, is not a function,
         * and doesn't start with a reserved character. If all of those are false, then
         * the property can be tracked.
         * 
         * @private
         * @param {object} obj The object to check the property against.
         * @param {string} property The property to check.
         * @returns {boolean} True if the property can be tracked, false otherwise.
         */
        var _isTrackableProperty = function (obj, property) {
            if (!obj.hasOwnProperty(property) ||
                typeof obj[property] === 'function' ||
                property.toString().substring(0, 1) === '_' ||
                property.toString().substring(0, 1) === '$' ||
                _ignoredProperties.indexOf(property) >= 0) {
                return false;
            }

            return true;
        };

        /**
         * Determines if all of the properties on the given object are untrackable.
         *
         * @private
         */
        var _isTrackableObject = function (obj) {
            var propertyCount = Object.keys(obj).length;
            if (propertyCount === 0) { return false; }

            var invalidPropertyCount = 0;
            for (var property in obj) {
                if (!_isTrackableProperty(obj, property)) {
                    invalidPropertyCount++;
                }
            }

            return propertyCount !== invalidPropertyCount;
        };

        /**
         * Fetches a mapped object by search for an object with a matching identifier as to what is provided.
         */
        var _getMappedObjectByIdentifier = function (identifier) {
            for (var i = 0; i < _objectMap.length; i++) {
                if (_objectMap[i].identifier === identifier) {
                    return _objectMap[i];
                }
            }

            return null;
        };

        /**
         * Copies that values from the source object to the mapped objects current and original values only
         * if those properties exist on the mapped objects, the property is a property we track, and that the 
         * values don't already match.
         */
        var _synchronizeObject = function (mappedObject, source) {
            for (var property in source) {
                if (source.hasOwnProperty(property) &&
                    _isTrackableProperty(source, property) &&
                    mappedObject.current.hasOwnProperty(property) &&
                    mappedObject.original.hasOwnProperty(property) &&
                    typeof mappedObject.current[property] !== 'object' &&
                    !(mappedObject.current[property] instanceof Array) &&
                    mappedObject.current[property] !== source[property]) {
                    mappedObject.current[property] = source[property];
                    mappedObject.original[property] = source[property];
                }
            }
        };

        /**
         * Takes the pased array and adds each of its elements to the the context.
         * 
         * If an element is an array, it will recurse.
         * 
         * @private
         * @param {array} ary The array to add to the context.
         * @param {object} rootParent The root parent of this array.
         * @param {boolean} isStatusAdded Whether or not this object should be added with a status of 'Added' or not.
         * @param {string} propertyName The property name on the parent that holds this array.
         */
        var _addArray = function(ary, rootParent, isStatusAdded, propertyName) {
            if (!(ary instanceof Array)) {
                throw new Error('An array must be specified.');
            }

            for (var i = 0; i < ary.length; i++) {
                if (typeof ary[i] === 'function') {
                    continue;
                }

                if (ary[i] instanceof Array) {
                    _addArray(ary[i], rootParent, isStatusAdded, propertyName);
                } else if (ary[i] && typeof ary[i] === 'object') {
                    if (self.doesObjectExist(ary[i])) {
                        continue;
                    }

                    _addObject(ary[i], rootParent, ary, isStatusAdded, propertyName);
                }
            }
        };

        /**
         * Find any children on the provided object that can be added to context.
         * 
         * @private
         * @param {object} obj
         * @param {object} rootParent
         * @param {boolean} isStatusAdded Whether or not this object should be added with a status of 'Added' or not.
         */
        var _addChildren = function (obj, rootParent, isStatusAdded) {
            // Check to see if there are any child objects that need to be added to
            // the context. This includes arrays of objects as well.
            for (var property in obj) {
                if (obj.hasOwnProperty(property)) {
                    if (!_isTrackableProperty(obj, property)) {
                        continue;
                    }

                    if (obj[property] instanceof Array) {
                        _addArray(obj[property], rootParent || obj, isStatusAdded, property);
                    } else if (obj[property] && typeof obj[property] === 'object' && !(obj[property] instanceof Date)) {
                        if (self.doesObjectExist(obj[property])) {
                            continue;
                        }

                        _addObject(obj[property], rootParent || obj, obj, isStatusAdded, property);
                    }
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
        var _setPropertyChanged = function (obj, property) {
            // Check if this property has already been added to the changeset
            var existingChangeEntry = null;
            for (var i = 0; i < obj.changeset.length; i++) {
                if (obj.changeset[i].PropertyName === property.toString()) {
                    existingChangeEntry = obj.changeset[i];
                    break;
                }
            }

            var isDate = obj.current[property] instanceof Date;
            var newValue = isDate ? obj.current[property].toISOString() : obj.current[property];

            if (existingChangeEntry !== null) {
                // Check if the original value is different to the new value in the object
                if (existingChangeEntry.OldValue != newValue) { // jshint ignore:line
                    // Update the existing changeset entry current value
                    existingChangeEntry.NewValue = newValue;
                } else {
                    // Since the object was reset to its original value, we remove it from the changeset
                    obj.changeset.splice(obj.changeset.indexOf(existingChangeEntry), 1);
                }
            } else {
                // Add a new changeset entry
                obj.changeset.push({
                    PropertyName: property.toString(),
                    OldValue: obj.original[property],
                    NewValue: newValue
                });

                // Update the object status to modified only if it is currently unmodified
                if (obj.status === ObjectContext.ObjectStatus.Unmodified) {
                    obj.status = ObjectContext.ObjectStatus.Modified;
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
         * @private
         * @param {object} obj The mapped object to evaluate for changes.
         */
        var _checkForChanges = function (obj) {
            for (var property in obj.current) {
                if (obj.current.hasOwnProperty(property)) {

                    // Skip private/angular/array/object properties
                    if (!_isTrackableProperty(obj.current, property)) {
                        continue;
                    }

                    // If this property is an array then check to see if the length has changed.
                    // Otherwise just compare the properties values
                    if (obj.current[property] instanceof Array) {
                        var ary = obj.current[property];
                        var deletedObjectCount = 0;

                        for (var i = 0; i < ary.length; i++) {
                            if (typeof ary[i] === 'object' && _isTrackableObject(ary[i])) {
                                if (self.getObjectStatus(ary[i]) === ObjectContext.ObjectStatus.Deleted) {
                                    deletedObjectCount++;
                                }
                            }
                        }

                        // Check to see if the lengths of the corresponding arrays are different, if so add them to the changeset
                        if ((obj.current[property].length - deletedObjectCount) !== obj.original[property].length) {
                            _setPropertyChanged(obj, property);
                        } else if (obj.current[property].length === obj.original[property].length) {
                            // The lengths are the same so check to see if there are any differences in the values of 
                            // the array (for primitive types only)
                            for (var j = 0; j < obj.current[property].length; j++) {
                                var currentValue = obj.current[property][j];

                                // We only test primitive types here. Object comparisons would not work unless we checked
                                // structure and values recursively. Which is doable, will come back to this later.
                                if (typeof currentValue !== 'object') {
                                    var originalValue = obj.original[property][j];

                                    // We are doing a strict-compare here, but maybe this should be double-equals for type coercion?
                                    if (currentValue !== originalValue) {
                                        _setPropertyChanged(obj, property);
                                        break;
                                    }
                                }
                            }
                        }
                    } else {
                        var hasDateChanged = false;
                        if ((obj.current[property] instanceof Date && !(obj.original[property] instanceof Date)) ||
                            (!(obj.current[property] instanceof Date) && obj.original[property] instanceof Date) ||
                            (obj.current[property] instanceof Date && obj.current[property].toISOString() !== obj.original[property].toISOString()))
                        {
                            hasDateChanged = true;
                        }

                        if (((obj.current[property] === null || typeof obj.current[property] !== 'object') && obj.current[property] !== obj.original[property]) || hasDateChanged) {
                            _setPropertyChanged(obj, property);
                        }
                    }
                }
            }
        };

        /**
         * Returns the index of an existing object in the object map.
         * 
         * @private
         * @param {object} obj An existing object to search for.
         */
        var _getMapIndex = function (obj) {
            for (var i = 0; i < _objectMap.length; i++) {
                if (_objectMap[i].current === obj) {
                    return i;
                }
            }

            return null;
        };

        /**
         * Returns the mapped object instance using the provided object reference.
         * 
         * @private
         * @param {object} obj The object to search for.
         * @returns {object} A mapped object.
         */
        var _getMappedObject = function (obj) {
            var mappedObjectIndex = _getMapIndex(obj);

            if (mappedObjectIndex === null) {
                throw new Error('Object not found.');
            }

            return _objectMap[mappedObjectIndex];
        };

        /**
         * Returns all objects (in their current state) that have the provided status.
         * 
         * @private
         * @param {ObjectStatus} status The status of the requested objects.
         * @param {boolean} parentsOnly Retrieve only parent objects.
         * @returns {array} An array of objects with a status of 'status'.
         */
        var _getObjectsByStatus = function (status, parentsOnly) {
            var objects = [];

            for (var i = 0; i < _objectMap.length; i++) {
                var mappedObject = _objectMap[i];

                if (mappedObject.status === status && (!parentsOnly || (parentsOnly === true && !mappedObject.rootParent))) {
                    objects.push(_objectMap[i].current);
                }
            }

            return objects;
        };

        /**
         * Returns the native type of the provided object as a string.
         *
         * @private
         * @param {object} obj The object to test.
         * @returns {string} The type of the object.
         */
        var _getNativeType = function (obj) {
            var funcNameRegex = /function (.{1,})\(/;
            var results = (funcNameRegex).exec((obj).constructor.toString());

            return (results && results.length > 1) ? results[1] : '';
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
         * @private
         * @param {object} obj An object to add to the context that will be tracked for changes.
         * @param {object} rootParent The root parent of obj.
         * @param {object} parent The direct parent of obj.
         * @param {boolean} isStatusAdded Whether or not this object should be added with a status of 'Added' or not.
         * @param {string} propertyName The property name on the parent that holds this object.
         * @returns {object} A reference of this for method chaining.
         */
        var _addObject = function(obj, rootParent, parent, isStatusAdded, propertyName) {
            if (!obj || typeof obj !== 'object' || obj instanceof Array) {
                throw new Error('Invalid object specified. The value provided must be of type "object".');
            }

            var status = isStatusAdded ? ObjectContext.ObjectStatus.Added : ObjectContext.ObjectStatus.Unmodified;
            var type = (_objectTypePropertyName && _objectTypePropertyName.trim().length > 0 && obj.hasOwnProperty(_objectTypePropertyName)) ? obj[_objectTypePropertyName] : _getNativeType(obj);

            if (self.doesObjectExist(obj) || !_isTrackableObject(obj)) {
                return self;
            }

            _objectMap.push(_createMappedObject(obj, status, type, rootParent, parent, propertyName));
            _addChildren(obj, rootParent, isStatusAdded);

            return self;
        };

        /**
         * Sets the service URI to use when making AJAX load requests.
         *
         * @public
         * @returns {object} A reference to this for method chaiing.
         */
        this.setServiceUri = function (serviceUri) {
            _serviceUri = serviceUri;
            return this;
        };

        /**
         * Updates the date time
         * @param {Date} date A Date object to update.
         * @param {string} isoString An ISO-8601 formatted date string.
         */
        var _setDate = function(date, isoString) {
            if (!_isValidDateString(isoString)) {
                throw new Error('The provided date string \"' + isoString + '\" is in an unsupported format.');
            }

            var newDate = new Date(isoString);
            date.setTime(newDate.getTime());
            return date;
        };

        /**
         * Determines if the provided date string is in a valid date format.
         * @param  {string} dateString The date string to test.
         * @return {Boolean} True if the date passes the format validation.
         */
        var _isValidDateString = function(dateString) {
            if (typeof dateString !== 'string') {
                throw new Error('An invalid dateString was provided: ' + dateString);
            }
            return Date.parse(dateString);
        };

        /**
         * Returns the property names for all properties of type Date.
         * @param  {object} obj The object to check.
         * @return {string[]} An array of string property names.
         */
        var _getDateProperties = function(obj) {
            var dateProperties = [];
            for (var prop in obj) {
                if (obj.hasOwnProperty(prop) && obj[prop] instanceof Date) {
                    dateProperties.push(prop);
                }
            }
            return dateProperties;
        };

        /**
         * Creates date objects for all properties provided.
         * @param  {string[]} dateProperties An array of property names.
         * @param  {object} obj The object to set the dates on.
         */
        var _instantiateDateProperties = function(dateProperties, obj) {
            dateProperties.forEach(function(prop) {
                if (obj[prop] && typeof obj[prop] === 'string' && _isValidDateString(obj[prop])) {
                    obj[prop] = new Date(obj[prop]);
                }
            });
        };

        /**
         * Iterates over the object map and finds all objects that are not referenced
         * on any other objects anymore and removes their entries from the object map.
         */
        var _removeOrphanedChildren = function() {
            for (var i = _objectMap.length - 1; i >= 0; i--) {
                if (_objectMap[i].parent && _objectMap[i].propertyName) {
                    var found = false;
                    var mappedObject = _objectMap[i];
                    for (var j = _objectMap.length - 1; j >= 0; j--) {
                        if (_objectMap[j] !== mappedObject && _objectMap[j].current.hasOwnProperty(mappedObject.propertyName)) {
                            if (_objectMap[j].current[mappedObject.propertyName] instanceof Array && _objectMap[j].current[mappedObject.propertyName].indexOf(mappedObject.current) >= 0) {
                                found = true;
                                break;
                            }
                            else if (typeof _objectMap[j].current[mappedObject.propertyName] === 'object' && _objectMap[j].current[mappedObject.propertyName] === mappedObject.current) {
                                found = true;
                                break;
                            }
                        }
                    }

                    if (!found) {
                        _objectMap.splice(i, 1);
                    }
                }
            }
        };

        /**
         * Sets the property name to look for on objects to retrieve its data type as a string value.
         *
         * Note: This is optional and if it is not provided, then the objects native JavaScript data type will be used.
         *
         * @public
         * @returns {object} A reference to this for method chaiing.
         */
        this.setObjectTypePropertyName = function (propertyName) {
            _objectTypePropertyName = propertyName;
            return this;
        };

        /**
         * Sets the property name to look for on objects to retrieve its key as a an array of strings.
         *
         * Note: This is optional.
         *
         * @public
         * @returns {object} A reference to this for method chaiing.
         */
        this.setObjectKeyPropertyName = function (propertyName) {
            _objectKeyPropertyName = propertyName;
            return this;
        };

        /**
         * This is the change tracking engine.
         *
         * Checks if any of the property values in each of the tracked objects have any changes.
         *
         * Will recursively evaluate child properties that are arrays/objects themselves.
         * 
         * @public
         * @returns {object} A reference of this for method chaining.
         */
        this.evaluate = function () {
            // Loop through each of the objects currently loaded, and evaluate them for
            // changes. If the object is marked as deleted/added, then it will be skipped as 
            // we already know that there are changes.
            for (var i = 0; i < _objectMap.length; i++) {
                var mappedObj = _objectMap[i];

                // If the object is marked as deleted then we can skip it
                if (mappedObj.status === ObjectContext.ObjectStatus.Deleted) {
                    continue;
                }

                // First we need to check if there are any new objects to add from 
                // any arrays within the hierarchy of the currently mapped object
                _addChildren(mappedObj.current, mappedObj.rootParent, true);

                _checkForChanges(mappedObj);
            }

            // Now that the evaluate loop has finished, call any change listeners subscribed to us
            for (var x = 0; x < _changeListeners.length; x++) {
                var listener = _changeListeners[x];

                if (listener && typeof listener === 'function') {
                    listener(this.hasChanges());
                }
            }

            return this;
        };

        /**
         * Checks to see if the provided object has already been added to the context.
         * 
         * @public
         * @param {object} objectReference An object to test for existance.
         * @returns {boolean} True if the objects exists already, false otherwise.
         */
        this.doesObjectExist = function (objectReference) {
            if (!objectReference) { return false; }

            for (var i = 0; i < _objectMap.length; i++) {
                if (_objectMap[i].current === objectReference) {
                    return true;
                }
            }

            return false;
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
         * @public
         * @param {object} obj An object to add to the context that will be tracked for changes.
         * @param {boolean} isStatusAdded Whether or not this object should be added with a status of 'Added' or not.
         * @returns {object} A reference of this for method chaining.
         */
        this.add = function (obj, isStatusAdded) {
            return _addObject(obj, null, null, isStatusAdded, null);
        };

        /**	
         * Deletes an existing object from change tracking and all objects that are a
         * child of the provided object.
         * 
         * @public
         * @param {object} obj An object to delete.
         * @param {boolean} hardDelete Whether or not to remove the object from the context, or just mark it for deletion.
         * @returns {object} A reference of this for method chaining.
         */
        this.delete = function (obj, hardDelete) {
            var i, currentObject;
            var index = _getMapIndex(obj);

            if (index === null) {
                throw new Error('Object was not found. Removal failed.');
            }

            // If this object has a status of Added (then just remove the object completely)
            // along with any of its children.
            if (_objectMap[index].status === ObjectContext.ObjectStatus.Added) {
                hardDelete = true;
            }

            // Are we removing the object or just marking it as deleted
            if (hardDelete === true) {
                var foundInArray = false;
                if (_objectMap[index].status === ObjectContext.ObjectStatus.Added && _objectMap[index].parent && _objectMap[index].parent instanceof Array) {
                    _objectMap[index].parent.splice(_objectMap[index].parent.indexOf(_objectMap[index].current), 1);
                    foundInArray = true;
                }

                currentObject = _objectMap[index].current;
                _objectMap.splice(index, 1);

                if (!foundInArray) {
                    // Go through the object map and find an object that has a child that
                    // matches that of the object we are deleting. Then reset its value
                    // back to its original value.
                    for (i = 0; i < _objectMap.length; i++) {
                        var done = false;
                        for (var prop in _objectMap[i].current) {
                            if (_objectMap[i].current.hasOwnProperty(prop) && _objectMap[i].current[prop] === currentObject) {
                                _objectMap[i].current[prop] = _deepCopy(_objectMap[i].original[prop]);
                                done = true;
                                break;
                            }
                        }
                        if (done) {
                            break;
                        }
                    }
                }
            } else if (_objectMap[index].status !== ObjectContext.ObjectStatus.Added) {
                _objectMap[index].status = ObjectContext.ObjectStatus.Deleted;
            }

            // Remove all objects that are a child of this object
            for (i = _objectMap.length - 1; i >= 0; i--) {
                currentObject = _objectMap[i];

                if (currentObject.current === obj) {
                    continue;
                }

                if (currentObject.rootParent === obj) {
                    if (hardDelete === true) {
                        _objectMap.splice(i, 1);
                    } else if (currentObject.status !== ObjectContext.ObjectStatus.Added) {
                        currentObject.status = ObjectContext.ObjectStatus.Deleted;
                    }
                }
            }

            // Now that the object has been removed and reset, we need to go through the
            // object map and fix up any parent and children that don't have matching values.
            for (i = 0; i < _objectMap.length; i++) {
                if (_objectMap[i].parent && typeof _objectMap[i].parent === 'object' && !(_objectMap[i].parent instanceof Array) && _objectMap[i].propertyName && _objectMap[i].parent[_objectMap[i].propertyName] !== _objectMap[i].current) {
                    _objectMap[i].parent[_objectMap[i].propertyName] = _objectMap[i].current;
                }
            }

            this.evaluate();

            return this;
        };

        /**
         * Determines if any of the tracked objects have any active changesets. If an
         * object is passed, then just that object will be tested for changes.
         * 
         * @public
         * @returns {boolean} Determines whether or not the context has any objects with changes.
         */
        this.hasChanges = function (obj) {
            if (obj) {
                var mappedObject = _getMappedObject(obj);
                return mappedObject.hasChanges();
            } else {
                for (var i = 0; i < _objectMap.length; i++) {
                    if (_objectMap[i].hasChanges()) {
                        return true;
                    }
                }
            }

            return false;
        };

        /**
         * Determines if the provided object has children that are marked as being changed.
         * 
         * @public
         * @returns {boolean}
         */
        this.hasChildChanges = function (obj) {
            if (!obj) {
                throw new Error('Error determining if object has child changes. The object could not be found.');
            }

            var mappedObject = _getMappedObject(obj);

            // The hasChildChanges property is set inside hasChanges so we need
            // to call this first.
            mappedObject.hasChanges();

            return mappedObject.hasChildChanges;
        };

        /**
         * Removes all currently tracked objects and resets the state of the context.
         *
         * This will usually be called when the state of the application is being destroyed,
         * and any object that are laoded into the context are no longer relevant.
         * 
         * @public
         * @returns {object} A reference of this for method chaining.
         */
        this.clear = function () {
            _objectMap.length = 0;
            return this;
        };

        /**
         * Returns all objects in the context in their current state.
         * 
         * @public
         * @returns {array} An Array of objects that exists in the context.
         */
        this.getObjects = function (returnMappedObjects) {
            var objects = [];

            for (var i = 0; i < _objectMap.length; i++) {
                objects.push(returnMappedObjects ? _objectMap[i] : _objectMap[i].current);
            }

            return objects;
        };

        /**
         * Returns all objects that have status of 'Unmodified'.
         * 
         * @public
         * @param {boolean} parentsOnly Retrieve only parent objects.
         * @returns {array} An array of objects with a status of 'Unmodified'.
         */
        this.getUnmodifiedObjects = function (parentsOnly) {
            return _getObjectsByStatus(ObjectContext.ObjectStatus.Unmodified, parentsOnly);
        };

        /**
         * Returns all objects that have status of 'Modified'.
         * 
         * @public
         * @param {boolean} parentsOnly Retrieve only parent objects.
         * @returns {array} An array of objects with a status of 'Modified'.
         */
        this.getModifiedObjects = function (parentsOnly) {
            return _getObjectsByStatus(ObjectContext.ObjectStatus.Modified, parentsOnly);
        };

        /**
         * Returns all objects that have status of 'Added'.
         * 
         * @public
         * @param {boolean} parentsOnly Retrieve only parent objects.
         * @returns {array} An array of objects with a status of 'Added'.
         */
        this.getAddedObjects = function (parentsOnly) {
            return _getObjectsByStatus(ObjectContext.ObjectStatus.Added, parentsOnly);
        };

        /**
         * Returns all objects that have status of 'Deleted'.
         * 
         * @public
         * @param {boolean} parentsOnly Retrieve only parent objects.
         * @returns {array} An array of objects with a status of 'Deleted'.
         */
        this.getDeletedObjects = function (parentsOnly) {
            return _getObjectsByStatus(ObjectContext.ObjectStatus.Deleted, parentsOnly);
        };

        /**
         * Attempts to find a single object in the context using the provided property.
         * 
         * @public
         * @param {string} requestedType The type of objects to fetch from the context.
         * @returns {array} An array of objects found.
         */
        this.getObjectsByType = function (requestedType) {
            var objects = [];

            for (var i = 0; i < _objectMap.length; i++) {
                if (_objectMap[i].type === requestedType) {
                    objects.push(_objectMap[i].current);
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
         * 
         * @public
         * @returns {object} A reference of this for method chaining.
         */
        this.acceptChanges = function (saveResultMap) {
            var evalChanges = false;
            var currentObject = {};

            // First we need to determine if there are any objects that are part of an 
            // array need to be removed. If there are, remove them and then reevaluate.
            for (var i = _objectMap.length - 1; i >= 0; i--) {
                currentObject = _objectMap[i];

                if (currentObject.status === ObjectContext.ObjectStatus.Deleted &&
                    currentObject.parent && currentObject.parent instanceof Array) {
                    currentObject.parent.splice(currentObject.parent.indexOf(currentObject.current), 1);
                    _objectMap.splice(i, 1);
                    evalChanges = true;
                }
            }

            // Due to the loop above, if there was an object removed from an array, we 
            // need to reevaluate all objects for new changes before applying.
            if (evalChanges) {
              this.evaluate();
            }

            // Now go through and remove/set remaining objects
            for (i = _objectMap.length - 1; i >= 0; i--) {
                currentObject = _objectMap[i];

                if (currentObject.status !== ObjectContext.ObjectStatus.Unmodified) {
                    // If this object is marked as deleted, then we remove it from the context
                    if (currentObject.status === ObjectContext.ObjectStatus.Deleted) {
                        _objectMap.splice(i, 1);
                    } else {
                        // This object was either Added or Modified so set it to an Unmodified state
                        currentObject.changeset = [];
                        currentObject.status = ObjectContext.ObjectStatus.Unmodified;
                        currentObject.originalStatus = currentObject.status;
                        var dateProperties = _getDateProperties(currentObject.current);
                        currentObject.original = _deepCopy(currentObject.current);
                        if (dateProperties.length) {
                            _instantiateDateProperties(dateProperties, currentObject.original);
                        }
                    }
                }
            }

            // Check we were passed a valid save result map object
            // If so, then we need to refresh any object values with their values in the result map
            if (saveResultMap && typeof saveResultMap === 'object') {
                for (var key in saveResultMap) {
                    if (saveResultMap.hasOwnProperty(key) && saveResultMap[key] && typeof saveResultMap[key] === 'object') {
                        var mappedObject = _getMappedObjectByIdentifier(key);
                        if (!mappedObject) { continue; }
                        _synchronizeObject(mappedObject, saveResultMap[key]);
                    }
                }
            }

            this.evaluate();

            _removeOrphanedChildren();

            return this;
        };

        /**
         * Returns the changeset for a specified mapped object reference.
         * 
         * @public
         * @param {object} obj The object to check for changes against.
         * @returns {object} An object with the properties that have changed on the provided object 'obj'.
         */
        this.getObjectChangeset = function (obj) {
            if (!obj) {
                throw new Error('Invalid object provided. You must provided an object.');
            }

            var mappedObject = _getMappedObject(obj);

            return mappedObject.changeset;
        };

        /**
         * Returns a changeset for the entire context. This changeset is an object that has three properties containing arrays:
         *     - Added: Objects with a change status of 'Added'.
         *     - Unmodified: Object with a change status of 'Unmodified'.
         *     - Deleted: Objects with a change status of 'Deleted'.
         *
         * Each object in the collections contain its type and an array of changed properties.
         *
         * @public
         * @returns {object} An object containing an array of the changed object separated by change status.
         */
        this.getChangeset = function () {
            var changeset = {};
            changeset[ObjectContext.ObjectStatus.Added] = [];
            changeset[ObjectContext.ObjectStatus.Modified] = [];
            changeset[ObjectContext.ObjectStatus.Deleted] = [];

            for (var i = 0; i < _objectMap.length; i++) {
                var currentObj = _objectMap[i];

                if (currentObj.status === ObjectContext.ObjectStatus.Unmodified) { continue; }

                var changesetEntry = {};

                changesetEntry.Changeset = currentObj.changeset;
                var dateProperties = _getDateProperties(currentObj.current);
                changesetEntry.Object = _deepCopy(currentObj.current);
                if (dateProperties.length) {
                    _instantiateDateProperties(dateProperties, changesetEntry.Object);
                }
                changesetEntry.ContextIdentifier = currentObj.identifier;

                changeset[currentObj.status].push(changesetEntry);
            }

            return changeset;
        };

        /**
         * Returns a copy of the original unchanged object in the state that it was in 
         * when it was either added or last saved. 
         * 
         * If the object is not found then null is returned.
         * 
         * @public
         * @param {object} objectReference The object to search for.
         * @returns {object|null} A copy of the original object, or null if not found.
         */
        this.getOriginal = function (objectReference) {
            for (var i = 0; i < _objectMap.length; i++) {
                if (_objectMap[i].current === objectReference) {
                    var dateProperties = _getDateProperties(_objectMap[i].original);
                    var copy = _deepCopy(_objectMap[i].original);
                    if (dateProperties.length) {
                        _instantiateDateProperties(dateProperties, copy);
                    }
                    return copy;
                }
            }
            return null;
        };

        /**
         * Gets an object status for the specified object reference.
         * 
         * @public
         * @param {object} obj The object to search for.
         * @returns {string} The status of the requested object.
         */
        this.getObjectStatus = function (obj) {
            if (!obj) {
                throw new Error('Invalid object provided.');
            }

            var mappedObjectIndex = _getMapIndex(obj);

            if (mappedObjectIndex === null) {
                throw new Error(_stringFormat('Invalid object index: {0}', mappedObjectIndex));
            }

            return _objectMap[mappedObjectIndex].status;
        };

        /**
         * Gets an objects type for the specified object reference.
         * 
         * @public
         * @param {object} obj The object to search for.
         * @returns {string} The status of the requested object.
         */
        this.getObjectType = function (obj) {
            if (!obj) {
                throw new Error('Invalid object provided.');
            }

            var mappedObjectIndex = _getMapIndex(obj);

            if (mappedObjectIndex === null) {
                throw new Error(_stringFormat('Invalid object index: {0}', mappedObjectIndex));
            }

            return _objectMap[mappedObjectIndex].type;
        };

        /**
         * Rejects changes for object that exist in the context by setting the values in
         * the object back their original values.
         * 
         * If a single object is passed, it will be tested for existance and then that
         * one object will be reverted. If no object is passed, then all objects will be
         * reverted.
         * 
         * @public
         * @param {object} obj An existing context object to reject changes for.
         * @returns {object} A reference to this for chaining.
         */
        this.rejectChanges = function (obj) {
            var i = 0;
            var mappedObject = {};
            if (obj) {
                mappedObject = _getMappedObject(obj);
                var currentObject = {};
                // When rejecting changes for an object that is marked as 'Added', we just
                // remove that object as well as any objects that are a parent or root parent
                if (mappedObject.status === ObjectContext.ObjectStatus.Added) {
                    for (i = _objectMap.length - 1; i >= 0; i--) {
                        currentObject = _objectMap[i];
                        if (currentObject === mappedObject || currentObject.rootParent === mappedObject.current || currentObject.parent === mappedObject.current) {
                            self.delete(currentObject.current, true);
                        }
                    }
                } else {
                    for (i = 0; i < _objectMap.length; i++) {
                        currentObject = _objectMap[i];
                        if (currentObject.current === obj || currentObject.parent === obj || currentObject.rootParent === obj) {
                            if (currentObject.status === ObjectContext.ObjectStatus.Modified || currentObject.status === ObjectContext.ObjectStatus.Deleted) {
                            _resetObject(currentObject);
                        } else if (currentObject.status === ObjectContext.ObjectStatus.Added) {
                            self.delete(currentObject.current, true);
                        }
                    }
                }
                }
            } else {
                for (i = _objectMap.length - 1; i >= 0; i--) {
                    mappedObject = _objectMap[i];

                    switch (mappedObject.status) {
                        case ObjectContext.ObjectStatus.Modified:
                        case ObjectContext.ObjectStatus.Deleted:
                            _resetObject(mappedObject);
                            break;
                        case ObjectContext.ObjectStatus.Added:
                            self.delete(mappedObject.current, true);
                            break;
                    }
                }
            }

            this.evaluate();

            return this;
        };

        /**
         * Removes any changes to a loaded object and reverts it to its unchanged state.
         * 
         * @private
         * @param {object} obj The mapped to reset.
         */
        var _resetObject = function (obj) {
            for (var i = 0; i < obj.changeset.length; i++) {
                var property = obj.changeset[i].PropertyName;

                if (obj.current[property] instanceof Array) {
                    var ary = obj.current[property];

                    for (var j = ary.length - 1; j >= 0; j--) {
                        if (typeof ary[j] === 'object') {
                            var mappedObject = _getMappedObject(ary[j]);

                            switch (mappedObject.status) {
                                case ObjectContext.ObjectStatus.Unmodified:
                                    break;
                                case ObjectContext.ObjectStatus.Modified:
                                case ObjectContext.ObjectStatus.Deleted:
                                    _resetObject(mappedObject);
                                    break;
                                case ObjectContext.ObjectStatus.Added:
                                    ary.splice(j, 1);
                                    _objectMap.splice(_objectMap.indexOf(mappedObject), 1);
                                    break;
                            }
                        } else {
                            // This is a primitive type so reset its value back to its original value
                            // *** We may run into issues here if there are arrays holding multiple different types,
                            // *** or if the array lengths are different.
                            obj.current[property] = _deepCopy(obj.original[property]);
                        }
                    }
                } else {
                    var value = obj.original[property];
                    if (obj.original[property] instanceof Date) {
                        value = new Date(obj.original[property].toISOString());
                    }

                    obj.current[property] = value;
                }
            }

            obj.status = obj.originalStatus;
            obj.changeset = [];
            obj.hasChildChanges = false;
        };

        /**
         * Subcribes the passed listener function that will be invoked when a change has occured.
         * 
         * @public
         * @param {function} listener A function to invoke when a change occurs to any objects in the context.
         */
        this.subscribeChangeListener = function (listener) {
            if (typeof listener !== 'function') {
                throw new Error('The provided listener must be a function callback.');
            }

            _changeListeners.push(listener);

            return _changeListeners.length;
        };

        /**
         * Unsubscribes the provided change listener.
         * 
         * @public
         * @param {function} listener A function reference to unsubscribe.
         */
        this.unsubscribeChangeListener = function (listener) {
            if (_changeListeners.indexOf(listener) < 0) {
                throw new Error('The provided listener function was not subscribed.');
            }

            _changeListeners.splice(_changeListeners.indexOf(listener), 1);

            return _changeListeners.length;
        };

        /**
         * This is a simple query method for fetching arrays of objects from the context.
         *
         * Returns an array of objects that exist in the context based on the
         * provided type and parameters.
         *
         * The `params` object should be a map of properties and values to search for
         * in all objects that are loaded into the context.
         *
         * @public
         * @param {string} type The type of objects to query.
         * @param {object} params A map of the property and values to search for.
         */
        this.query = function (type, params) {
            if (typeof type !== 'string') {
                throw new Error('The provided type must be a string.');
            } else if (params && typeof params !== 'object') {
                throw new Error('The provided query parameters must be an object.');
            }

            var foundObjects = [];

            for (var i = 0; i < _objectMap.length; i++) {
                var currentObj = _objectMap[i];

                // Make sure that the objects' type matches and if any parameters
                // were specified, that all of those properties exist in the object.
                if (currentObj.type === type) {
                    if (!params || hasParams(currentObj.current)) {
                        foundObjects.push(currentObj.current);
                    }
                }
            }

            /**
             * Local function that is used to test if an object has any of the
             * properties and values provided in the `params` object. If all
             * properties exist, then we return true, otherwise false.
             */
            function hasParams(obj) {
                for (var property in params) {
                    if (!obj.hasOwnProperty(property) || obj[property] !== params[property]) {
                        return false;
                    }
                }

                return true;
            }

            return foundObjects;
        };

        /**
         * Call this to load objects from an external resource directly into the context.
         * This method only supports loading valid JSON objects, and arrays of valid JSON objects. 
         * 
         * @public
         * @param {string} action The name of a service method to call.
         * @param {string} method The type of request to make (GET/POST).
         * @param {object} params An object containing query parameters to pass to the service method.
         * @param {function} onCompleteCallback A callback function to call when the request completes.
         */
        this.load = function (action, method, params, onCompleteCallback) {
            var self = this;

            if (!window.XMLHttpRequest) {
                throw new Error('Browser does not support XMLHttpRequest.');
            } else if (!action || typeof action !== 'string' || action.trim().length === 0) {
                throw new Error('Invalid load action provided: ' + action);
            } else if (method !== 'GET' && method !== 'POST') {
                // Should we support PUT and DELETE?
                throw new Error('Invalid request method provided: ' + method + '. Only GET and POST requests are supported.');
            } else if (!onCompleteCallback || typeof onCompleteCallback !== 'function') {
                throw new Error('Invalid callback provided. You must provide a callback function for when the request completes.');
            }

            var url = _serviceUri ? _serviceUri + action : action;

            var postParams = null;
            if (params) {
                if (method === 'POST') {
                    postParams = JSON.stringify(params);
                } else if (method === 'GET') {
                    var queryStringAry = [];
                    for (var property in params) {
                        if (params.hasOwnProperty(property)) {
                            queryStringAry.push(encodeURIComponent(property) + '=' + encodeURIComponent(params[property]));
                        }
                    }

                    url += '?' + queryStringAry.join('&');
                }
            }

            var request = new XMLHttpRequest();
            request.open(method, url, true);

            request.setRequestHeader('Accept', 'application/json');
            request.setRequestHeader('Content-Type', 'application/json');

            var abort = function () {
                request.abort();

                onCompleteCallback({
                    isSuccessful: false,
                    data: null,
                    errorMessage: 'ObjectContext: Request timed out.'
                });
            };

            var requestTimeout = setTimeout(abort, 30000);

            request.onreadystatechange = function () {
                if (request.readyState === 4) {
                    if (request.status === 200) {
                        clearTimeout(requestTimeout);

                        try {
                            var data = JSON.parse(request.responseText);

                            if (!data || typeof data !== 'object') {
                                onCompleteCallback({
                                    isSuccessful: false,
                                    data: null,
                                    errorMessage: 'Load Error: ' + request.responseText
                                });
                                return;
                            }

                            if (data instanceof Array) {
                                for (var i = 0; i < data.length; i++) {
                                    var obj = data[i];

                                    if (typeof obj === 'object') {
                                        self.add(obj);
                                    }
                                }
                            } else {
                                if (typeof data === 'object') {
                                    self.add(data);
                                }
                            }

                            onCompleteCallback({
                                isSuccessful: true,
                                data: data,
                                errorMessage: null
                            });
                        }
                        catch (e) {
                            onCompleteCallback({
                                isSuccessful: false,
                                data: null,
                                errorMessage: 'Load Error: ' + e.message
                            });
                        }
                    } else {
                        onCompleteCallback({
                            isSuccessful: false,
                            data: null,
                            errorMessage: 'Load Error: ' + request.status
                        });
                    }
                }
            };

            request.send(postParams);
        };

        /**
         * Adds an array of property names to the ingnored property name collection.
         *
         * @public
         */
        this.addIgnoredProperties = function (ary) {
            if (!ary || typeof ary !== 'object' || !(ary instanceof Array) || ary.length === 0) {
                throw new Error('Invalid array of properties to ignore was provided. Must be an array of strings.');
            }

            for (var i = 0; i < ary.length; i++) {
                if (typeof ary[i] === 'string') {
                    _ignoredProperties.push(ary[i]);
                } else {
                    throw new Error('addIgnoredProperties: Invalid property name. Ignored property name must be a string.');
                }
            }

            return this;
        };

        /**
         * Adds a property name to the ignored property name collection.
         *
         * @public
         */
        this.addIgnoredProperty = function (propertyName) {
            if (!propertyName || typeof propertyName !== 'string' || propertyName.length === 0) {
                throw new Error('addIgnoredProperty: Invalid property name. Ignored property name must be a string.');
            }

            _ignoredProperties.push(propertyName);

            return this;
        };

        /**
         * Output the state and all objects in the context to the console.
         */
        /* istanbul ignore next */
        this.log = function () {
            var date = new Date();
            var timestamp = date.getHours() + ':' + date.getMinutes() + ':' + date.getSeconds() + ':' + date.getMilliseconds();

            console.group('ObjectContext: ' + timestamp);

            console.log('Has Changes: ' + this.hasChanges());
            console.log('Tracked Objects: ' + _objectMap.length);

            var parentObjects = [];
            var childObjects = [];

            for (var i = 0; i < _objectMap.length; i++) {
                if (!_objectMap[i].rootParent) {
                    parentObjects.push(_objectMap[i]);
                } else {
                    childObjects.push(_objectMap[i]);
                }
            }

            console.group('All Objects');
            console.dir(_objectMap);
            console.groupEnd('All Objects');

            console.group('Parent Objects');
            console.dir(parentObjects);
            console.groupEnd('Parent Objects');

            console.group('Child Objects');
            console.dir(childObjects);
            console.groupEnd('Child Objects');

            console.group('Objects by Status');
            console.log('Unmodified', this.getUnmodifiedObjects());
            console.log('Modified', this.getModifiedObjects());
            console.log('Added', this.getAddedObjects());
            console.log('Deleted', this.getDeletedObjects());
            console.groupEnd('Objects by Status');

            console.groupEnd('ObjectContext');

            return this;
        };
    }

    /**
     * The state of a loaded context object.
     * @public
     */
    ObjectContext.ObjectStatus = {
        /**
         * The object is new, has been added to the object context, and the acceptChanges method has not been called. After the changes are saved, the object status changes to Unmodified.
         * @public
         */
        Added: 'Added',
        /**
         * The object has not been modified since it was attached to the context or since the last time that the acceptChanges method was called.
         * @public
         */
        Unmodified: 'Unmodified',
        /**
         * One of the scalar properties on the object was modified and the acceptChanges method has not been called. After the changes are saved, the object state changes to Unchanged.
         * @public
         */
        Modified: 'Modified',
        /**
         * The object has been marked as deleted from the object context. After the changes are saved, the object is removed from the context.
         * @public
         */
        Deleted: 'Deleted'
    };

    if (!window.ObjectContext) {
        window.ObjectContext = ObjectContext;
    }
})();
