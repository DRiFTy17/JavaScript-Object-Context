'use strict';

/**
 * The available object status for loaded objects.
 */
ObjectContext.ObjectStatus = {
    New: 'New',
    Unmodified: 'Unmodified',
    Modified: 'Modified',
    Deleted: 'Deleted'
};

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
     * Creates a deepy copy of the passed in object.
     * 
     * Note: The copy is done through the JavaScript JSON object, and doesn't copy
     * any functions that exists in the object. This includes auto getters/setters.
     * 
     * @private
     * @param {object} obj The object to copy.
     * @returns {object} A deep copy of the object.
     */
    var _deepCopy = function(obj) {
        return JSON.parse(JSON.stringify(obj));
    };
    
    /**
     * Gives us the ability to use placeholders in strings and replace their positions
     * with specified corresponding values.
     * 
     * @private
     * @returns {string} A formatted string.
     */
    var _stringFormat = function() {
        var s = arguments[0];

        for (var i = 0; i < arguments.length - 1; i++) {
            var reg = new RegExp("\\{" + i + "\\}", "gm");
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
    var _doesObjectHaveChanges = function(obj) {
        return obj.changeset.length > 0 ||
               obj.status === ObjectContext.ObjectStatus.New ||
               obj.status === ObjectContext.ObjectStatus.Modified ||
               obj.status === ObjectContext.ObjectStatus.Deleted;
    };
   
    /**
     * A helper function to create a mapped context object.
     * 
     * This will wrap the passed in object, and add any necessary properties to 
     * aid in the change tracking process.
     * 
     * @private
     * @param {object} obj An object to wrap.
     * @param {object} rootParent The root parent that this object is in the hierarchy of.
     * @param {object} parent The direct parent of this object.
     */
    var _createMappedObject = function(obj, status, type, rootParent, parent) {
        return {
            /**
             * The current state of the object.
             */
            current: obj,
            /**
             * A copy of the object in its unchanged state.
             */
            original: _deepCopy(obj),
            /**
             * Returns whether or not the current object has changes from its
             * original state.
             * 
             * @returns {boolean} True if the object has changes from its original state, false otherwise.
             */
            hasChanges: function() {
                var hasChanges = _doesObjectHaveChanges(this);

                // Reset has child changes before rechecking
                this.hasChildChanges = false;

                // Check if this object has any children that have changes
                for (var i=0; i<_objectMap.length; i++) {
                    var currentObject = _objectMap[i];

                    if (currentObject === this) continue;

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
             */
            changeset: [],
            /**
             * A reference to the root object that this object is a child of.
             * If this is the parent, then the value is null.
             */
            rootParent: rootParent,
            /**
             * A reference to the direct parent object of this object.
             */
            parent: parent,
            /**
             * Identifies if this object has any child objects that are changed.
             */
            hasChildChanges: false,
            /**
             * Holds the current status of the object we are tracking
             */
            status: status,
            /**
             * Holds the original status of the object we are tracking
             */
            originalStatus: status,
            /**
             * The type of the object we are tracking
             */
            type: type,
            /**
             * Look at the ExtensionData property to get the keys of the object.
             */
            key: obj.ExtensionData && obj.ExtensionData.Key && obj.ExtensionData.Key.length ? obj.ExtensionData.Key : null
        };
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
    var _isTrackableProperty = function(obj, property) {
        if (!obj.hasOwnProperty(property) || 
            typeof obj[property] === 'function' ||
            property.toString().substring(0, 1) === '_' || 
            property.toString().substring(0, 1) === '$') {
            return false;
        }

        return true;
    };
    
    /**
     * Takes the pased array and adds each of its elements to the the context.
     * 
     * If an element is an array, it will recurse.
     * 
     * @private
     * @param {array} ary The array to add to the context.
     * @param {object} rootParent The root parent of this array.
     * @param {boolean} isStatusNew Whether or not this object should be added with a status of 'New' or not.
     */
    var _addArray = function(ary, rootParent, isStatusNew) {
        if (!(ary instanceof Array)) {
            throw new Error('An array must be specified.');
        }

        for (var i=0; i<ary.length; i++) {
            if (typeof ary[i] === 'function') {
                continue;
            }

            if (ary[i] instanceof Array) {
                _addArray(ary[i], rootParent, isStatusNew);
            }
            else if (typeof ary[i] === 'object') {
                if (self.doesObjectExist(ary[i])) {
                    continue;
                }

                _addObject(ary[i], rootParent, ary, isStatusNew);
            }
            else {
                throw new Error(_stringFormat('Invalid array item type found ("{0}") at index {1}.', typeof ary[i], i));
            }
        }
    };
    
    /**
     * Find any children on the provided object that can be added to context.
     * 
     * @private
     * @param {object} obj
     * @param {object} rootParent
     * @param {boolean} isStatusNew Whether or not this object should be added with a status of 'New' or not.
     */
    var _addChildren = function(obj, rootParent, isStatusNew) {
        // Check to see if there are any child objects that need to be added to
        // the context. This includes arrays of objects as well.
        for (var property in obj) {
            if (!_isTrackableProperty(obj, property)) {
                continue;
            }

            if (obj[property] instanceof Array) {
                _addArray(obj[property], rootParent || obj, isStatusNew);
            }
            else if (typeof obj[property] === 'object') {
                if (self.doesObjectExist(obj[property])) {
                    continue;
                }

                _addObject(obj[property], rootParent || obj, obj, isStatusNew);
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
    var _setPropertyChanged = function(obj, property) {
        // Check if this property has already been added to the changeset
        var existingChangeEntry = null;
        for (var i=0; i<obj.changeset.length; i++) {
            if (obj.changeset[i].propertyName === property.toString()) {
                existingChangeEntry = obj.changeset[i];
                break;
            }
        }

        if (existingChangeEntry !== null) {
            // Check if the original value is different to the new value in the object
            if (existingChangeEntry.oldValue != obj.current[property]) {
                // Update the existing changeset entry current value
                existingChangeEntry.newValue = obj.current[property];
            }
            else {
                // Since the object was reset to its original value, we remove it from the changeset
                obj.changeset.splice(obj.changeset.indexOf(existingChangeEntry), 1);
            }
        }
        else {
            // Add a new changeset entry
            obj.changeset.push({
                propertyName: property.toString(),
                oldValue: obj.original[property],
                newValue: obj.current[property]
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
     var _checkForChanges = function(obj) {
        for (var property in obj.current) {
            // Skip private/angular/array/object properties
            if (!_isTrackableProperty(obj.current, property)) {
                continue;
            }

            // If this property is an array then check to see if the length has changed.
            // Otherwise just compare the properties values
            if (obj.current[property] instanceof Array) {
                var ary = obj.current[property];
                var deletedObjectCount = 0;

                for (var i=0; i<ary.length; i++) {
                    if (self.getObjectStatus(ary[i]) === ObjectContext.ObjectStatus.Deleted) {
                        deletedObjectCount++;
                    }
                }

                // Removed (9/5/14) - No longer adding array properties to changeset
                // if ((obj.current[property].length - deletedObjectCount) !== obj.original[property].length) {
                //     _setPropertyChanged(obj, property);
                // }
            }
            else if (typeof obj.current[property] !== 'object' && obj.current[property] !== obj.original[property]) {
                _setPropertyChanged(obj, property);
            }
        }
    };
    
    /**
     * Returns the index of an existing object in the object map.
     * 
     * @private
     * @param {object} obj An existing object to search for.
     */
    var _getMapIndex = function(obj) {
        for (var i=0; i<_objectMap.length; i++) {
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
    var _getMappedObject = function(obj) {
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
    var _getObjectsByStatus = function(status, parentsOnly) {
        var objects = [];

        for (var i=0; i<_objectMap.length; i++) {
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
    var _getNativeType = function(obj) {
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
     * @param {boolean} isStatusNew Whether or not this object should be added with a status of 'New' or not.
     * @returns {object} A reference of this for method chaining.
     */
    var _addObject = function(obj, rootParent, parent, isStatusNew) {
        var status = isStatusNew ? ObjectContext.ObjectStatus.New : ObjectContext.ObjectStatus.Unmodified;
        var type = _getNativeType(obj);

        if (!obj || typeof obj !== 'object' || obj instanceof Array) {
            throw new Error('Invalid object specified. The value provided must be of type "object".');
        }

        if (self.doesObjectExist(obj)) {
            return self;
        }

        _objectMap.push(_createMappedObject(obj, status, type, rootParent, parent));
        _addChildren(obj, rootParent, isStatusNew);

        return self;
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
    this.evaluate = function() {
        // Loop through each of the objects currently loaded, and evaluate them for
        // changes. If the object is marked as deleted/new, then it will be skipped as 
        // we already know that there are changes.
        for (var i=0; i<_objectMap.length; i++) {
            var mappedObj = _objectMap[i];

            // If the object is marked as deleted then we can skip it
            if (mappedObj.status === ObjectContext.ObjectStatus.Deleted) {
                continue;
            }

            // First we need to check if there are any new objects to add from 
            // any arrays within the hierarchy of the currently mapped
            _addChildren(mappedObj.current, mappedObj.rootParent, true);

            _checkForChanges(mappedObj);
        }

        // Now that the evaluate loop has finished, call any change listeners subscribed to us
        for (var x=0; x<_changeListeners.length; x++) {
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
    this.doesObjectExist = function(objectReference) {
        if (!objectReference) return false;

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
     * @param {boolean} isStatusNew Whether or not this object should be added with a status of 'New' or not.
     * @returns {object} A reference of this for method chaining.
     */
    this.add = function(obj, isStatusNew) {
        return _addObject(obj, null, null, isStatusNew);
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
    this.delete = function(obj, hardDelete) {
        var index = _getMapIndex(obj);

        if (index === null) {
            throw new Error('Object was not found. Removal failed.');
        }

        // If this object has a status of new (then just remove the object completely)
        // along with any of its children.
        if (_objectMap[index].status === ObjectContext.ObjectStatus.New) {
            hardDelete = true;
        }

        // Are we removing the object or just marking it as deleted
        if (hardDelete === true) {
            if (_objectMap[index].status === ObjectContext.ObjectStatus.New &&
                _objectMap[index].parent && _objectMap[index].parent instanceof Array) {
                _objectMap[index].parent.splice(_objectMap[index].parent.indexOf(_objectMap[index].current), 1);
            }

            _objectMap.splice(index, 1);
        }
        else if (_objectMap[index].status !== ObjectContext.ObjectStatus.New) {
            _objectMap[index].status = ObjectContext.ObjectStatus.Deleted;
        }

        // Remove all objects that are a child of this object
        for (var i=_objectMap.length-1; i>=0; i--) {
            var currentObject = _objectMap[i];

            if (currentObject.current === obj) {
                continue;
            }

            if (currentObject.rootParent === obj) {
                if (hardDelete === true) {
                    _objectMap.splice(i, 1);
                }
                else if (currentObject.status !== ObjectContext.ObjectStatus.New) {
                    currentObject.status = ObjectContext.ObjectStatus.Deleted;
                }
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
    this.hasChanges = function(obj) {
        if (obj) {
            var mappedObject = _getMappedObject(obj);        
            return mappedObject.hasChanges();
        }
        else {
            for (var i=0; i<_objectMap.length; i++) {
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
    this.hasChildChanges = function(obj) {
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
    this.clear = function() {
        _objectMap.length = 0;
        return this;
    };

    /**
     * Returns all objects in the context in their current state.
     * 
     * @public
     * @returns {array} An Array of objects that exists in the context.
     */
    this.getObjects = function(returnMappedObjects) {
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
    this.getUnmodifiedObjects = function(parentsOnly) {
        return _getObjectsByStatus(ObjectContext.ObjectStatus.Unmodified, parentsOnly);
    };

    /**
     * Returns all objects that have status of 'Modified'.
     * 
     * @public
     * @param {boolean} parentsOnly Retrieve only parent objects.
     * @returns {array} An array of objects with a status of 'Modified'.
     */
    this.getModifiedObjects = function(parentsOnly) {
        return _getObjectsByStatus(ObjectContext.ObjectStatus.Modified, parentsOnly);
    };

    /**
     * Returns all objects that have status of 'New'.
     * 
     * @public
     * @param {boolean} parentsOnly Retrieve only parent objects.
     * @returns {array} An array of objects with a status of 'New'.
     */
    this.getNewObjects = function(parentsOnly) {
        return _getObjectsByStatus(ObjectContext.ObjectStatus.New, parentsOnly);
    };

    /**
     * Returns all objects that have status of 'Deleted'.
     * 
     * @public
     * @param {boolean} parentsOnly Retrieve only parent objects.
     * @returns {array} An array of objects with a status of 'Deleted'.
     */
    this.getDeletedObjects = function(parentsOnly) {
        return _getObjectsByStatus(ObjectContext.ObjectStatus.Deleted, parentsOnly);
    };

    /**
     * Attempts to find a single object in the context using the provided property.
     * 
     * @public
     * @param {string} requestedType The type of objects to fetch from the context.
     * @returns {array} An array of objects found.
     */
    this.getObjectsByType = function(requestedType) {
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
    this.acceptChanges = function() {
        var evalChanges = false;

        // First we need to determine if there are any objects that are part of an 
        // array need to be removed. If there are, remove them and then reevaluate.
        for (var i=_objectMap.length-1; i>=0; i--) {
            var currentObject = _objectMap[i];

            if (currentObject.status === ObjectContext.ObjectStatus.Deleted &&
                currentObject.parent && currentObject.parent instanceof Array) {
                currentObject.parent.splice(currentObject.parent.indexOf(currentObject.current), 1);
                _objectMap.splice(i, 1);
                evalChanges = true;
            }
        }

        // Due to the loop above, if there was an object removed from an array, we 
        // need to reevaluate all objects for new changes before applying.
        if (evalChanges) this.evaluate();

        // Now go through and remove/set remaining objects
        for (var i=_objectMap.length-1; i>=0; i--) {
            var currentObject = _objectMap[i];

            if (currentObject.status !== ObjectContext.ObjectStatus.Unmodified) {
                // If this object is marked as deleted, then we remove it from the context
                if (currentObject.status === ObjectContext.ObjectStatus.Deleted) {
                    _objectMap.splice(i, 1);
                }
                else {
                    // This object was either New or Modified so set it to an Unmodified state
                    currentObject.changeset = [];
                    currentObject.status = ObjectContext.ObjectStatus.Unmodified;
                    currentObject.original = _deepCopy(currentObject.current);
                }
            }
        }

        this.evaluate();

        return this;
    };
    
    /**
     * Returns the changeset for a specified mapped object reference.
     * 
     * @public
     * @param {object} obj The object to check for changes against.
     * @returns {object} An object with the properties that have changed on the provided object 'obj'.
     */
    this.getObjectChangeset = function(obj) {
        if (!obj) {
            throw new Error('Invalid object provided. You must provided an object.');
        }

        var mappedObject = null;
        mappedObject = _getMappedObject(obj);

        if (!mappedObject) {
            throw new Error('Invalid object provided. Changeset could not be found.');
        }

        return mappedObject.changeset;
    };

    /**
     * Returns a changeset for the entire context. This changeset is an object that has three properties containing arrays:
     *     - New: Objects with a change status of 'New'.
     *     - Unmodified: Object with a change status of 'Unmodified'.
     *     - Deleted: Objects with a change status of 'Deleted'.
     *
     * Each object in the collections contain its type and an array of changed properties.
     *
     * @public
     * @returns {object} An object containing an array of the changed object separated by change status.
     */
    this.getChangeset = function() {
        var changeset = {};
        changeset[ObjectContext.ObjectStatus.New] = [];
        changeset[ObjectContext.ObjectStatus.Modified] = [];
        changeset[ObjectContext.ObjectStatus.Deleted] = [];

        for (var i=0; i<_objectMap.length; i++) {
            var currentObj = _objectMap[i];

            if (currentObj.status === ObjectContext.ObjectStatus.Unmodified) continue;

            changeset[currentObj.status].push({
                type: currentObj.type,
                changeset: currentObj.changeset,
                object: _deepCopy(currentObj.current)
            });
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
    this.getOriginal = function(objectReference) {
        for (var i = 0; i < _objectMap.length; i++) {
            if (_objectMap[i].current === objectReference) {
                return _deepCopy(_objectMap[i].original);
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
    this.getObjectStatus = function(obj) {
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
    this.getObjectType = function(obj) {
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
    this.rejectChanges = function(obj) {
        if (obj) {
            var mappedObject = _getMappedObject(obj);

            // When rejecting changes for an object that is marked as 'New', we just
            // remove that object as well as any objects that are a parent or root parent
            if (mappedObject.status === ObjectContext.ObjectStatus.New) {
                for (var i=_objectMap.length-1; i>=0; i--) {
                    var currentObject = _objectMap[i];
                    
                    if (currentObject === mappedObject || 
                        currentObject.rootParent === mappedObject.current ||
                        currentObject.parent === mappedObject.current) {
                        self.delete(currentObject.current, true);
                    }
                };
            }
            else {
                for (var i=0; i<_objectMap.length; i++) {
                    var currentObject = _objectMap[i];

                    if (!currentObject.rootParent ||
                        currentObject.status === ObjectContext.ObjectStatus.Modified ||
                        currentObject.status === ObjectContext.ObjectStatus.Deleted) {
                        _resetObject(currentObject);
                    }
                    else if (currentObject.status === ObjectContext.ObjectStatus.New){
                        self.delete(currentObject.current, true);
                    }
                }
            }
        }
        else {
            for (var i=_objectMap.length-1; i>=0; i--) {
                var mappedObject = _objectMap[i];

                switch(mappedObject.status) {
                    case ObjectContext.ObjectStatus.Modified:
                    case ObjectContext.ObjectStatus.Deleted:
                        _resetObject(mappedObject);
                        break;
                    case ObjectContext.ObjectStatus.New:
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
    var _resetObject = function(obj) {
        for (var i=0; i<obj.changeset.length; i++) {
            var property = obj.changeset[i].propertyName;

            if (obj.current[property] instanceof Array) {
                var ary = obj.current[property];

                for (var j=ary.length-1; j>=0; j--) {
                    var mappedObject = _getMappedObject(ary[j]);

                    switch(mappedObject.status) {
                        case ObjectContext.ObjectStatus.Unmodified:
                            continue;
                            break;
                        case ObjectContext.ObjectStatus.Modified:
                        case ObjectContext.ObjectStatus.Deleted:
                            _resetObject(mappedObject);
                            break;
                        case ObjectContext.ObjectStatus.New:
                            ary.splice(j, 1);
                            _objectMap.splice(_objectMap.indexOf(mappedObject), 1);
                            break;
                    }
                }
            }
            else {
                obj.current[property] = obj.original[property];
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
    this.subscribeChangeListener = function(listener) {
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
    this.unsubscribeChangeListener = function(listener) {
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
    this.query = function(type, params) {
        if (typeof type !== 'string') {
            throw new Error('The provided type must be a string.');
        }
        else if (params && typeof params !== 'object') {
            throw new Error('The provided query parameters must be an object.');
        }

        var foundObjects = [];
        
        for (var i=0; i<_objectMap.length; i++) {
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
     * Output the state and all objects in the context to the console.
     */
    this.log = function() {
        var date = new Date();
        var timestamp = date.getHours() + ':' + date.getMinutes() + ':' + date.getSeconds() + ':' + date.getMilliseconds();

        console.group('ObjectContext: ' + timestamp);

        console.log('Has Changes: ' + this.hasChanges());
        console.log('Tracked Objects: ' + _objectMap.length);

        var parentObjects = [];
        var childObjects = [];

        for (var i=0; i<_objectMap.length; i++) {
            if (!_objectMap[i].rootParent) {
                parentObjects.push(_objectMap[i]);
            }
            else {
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
        console.log('New', this.getNewObjects());
        console.log('Deleted', this.getDeletedObjects());
        console.groupEnd('Objects by Status');

        console.groupEnd('ObjectContext');
        
        return this;
    };
}
