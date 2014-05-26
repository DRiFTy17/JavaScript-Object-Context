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
}

/**
 * Subcribes the passed listener function that will be invoked when a change has occured.
 * 
 * @param {function} listener A function to invoke when a change occurs to any objects in the context.
 */
ObjectContext.prototype.subscribeChangeListener = function(listener) {
    if (typeof listener !== 'function') {
        throw new Error('The provided listener must be a function callback.');
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
        throw new Error('The provided listener function was not subscribed.');
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
 * @param {object} rootParent The root parent of obj.
 * @param {boolean} isStatusNew Whether or not this object should be added with a status of 'New' or not.
 */
ObjectContext.prototype.add = function(obj, rootParent, parent, isStatusNew) {
    // Restrict passed in values to be an object
    if (typeof obj !== 'object' || obj instanceof Array) {
        throw new Error('Invalid object specified. The value provided must be of type "object".');
    }

    if (this.doesObjectExist(obj)) {
        throw new Error('Object already exists in the context.');
    }

    if (!obj._objectMeta) {
        obj._objectMeta = {
            status: isStatusNew ? ObjectContext.ObjectStatus.New : ObjectContext.ObjectStatus.Unmodified,
            type: 'Object'
        };
    } 
    else if (!obj._objectMeta.status) {
        obj._objectMeta.status = ObjectContext.ObjectStatus.Unmodified;
    }
    else if (!obj._objectMeta.type) {
        obj._objectMeta.type = 'Object';
    }
    else if (obj._objectMeta && obj._objectMeta.status && obj._objectMeta.status === ObjectContext.ObjectStatus.New) {
        isStatusNew = true;
    }

    if (obj._objectMeta.status !== ObjectContext.ObjectStatus.New &&
        obj._objectMeta.status !== ObjectContext.ObjectStatus.Unmodified &&
        obj._objectMeta.status !== ObjectContext.ObjectStatus.Modified &&
        obj._objectMeta.status !== ObjectContext.ObjectStatus.Deleted) {
        throw new Error(this.stringFormat('Invalid object status: {0}', obj._objectMeta.status));
    }

    this._objectMap.push(this._createMappedObject(obj, rootParent, parent));
    this._addChildren(obj, rootParent, isStatusNew);
};

/**
 * Find any children on the provided object that can be added to context.
 * 
 * @param {object} obj
 * @param {object} rootParent
 * @param {boolean} isStatusNew Whether or not this object should be added with a status of 'New' or not.
 */
ObjectContext.prototype._addChildren = function(obj, rootParent, isStatusNew) {
    // Check to see if there are any child objects that need to be added to
    // the context. This includes arrays of objects as well.
    for (var property in obj) {
        if (!this._isTrackableProperty(obj, property)) {
            continue;
        }

        if (obj[property] instanceof Array) {
            this._addArray(obj[property], rootParent || obj, isStatusNew);
        }
        else if (typeof obj[property] === 'object') {
            if (this.doesObjectExist(obj[property])) {
                continue;
            }

            this.add(obj[property], rootParent || obj, obj, isStatusNew);
        }
    }
};

/**
 * Takes the pased array and adds each of its elements to the the context.
 * 
 * If an element is an array, it will recurse.
 * 
 * @param {array} ary The array to add to the context.
 * @param {object} rootParent The root parent of this array.
 * @param {boolean} isStatusNew Whether or not this object should be added with a status of 'New' or not.
 */
ObjectContext.prototype._addArray = function(ary, rootParent, isStatusNew) {
    if (!(ary instanceof Array)) {
        throw new Error('An array must be specified.');
    }

    for (var i=0; i<ary.length; i++) {
        if (typeof ary[i] === 'function') {
            continue;
        }

        if (ary[i] instanceof Array) {
            this._addArray(ary[i], rootParent, isStatusNew);
        }
        else if (typeof ary[i] === 'object') {
            if (this.doesObjectExist(ary[i])) {
                continue;
            }

            this.add(ary[i], rootParent, ary, isStatusNew);
        }
        else {
            throw new Error(this.stringFormat('Invalid array item type found ("{0}") at index {1}.', typeof ary[i], i));
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
ObjectContext.prototype._createMappedObject = function(obj, rootParent, parent) {
    var self = this;

    return {
        /**
         * The current state of the object.
         */
        current: obj,
        /**
         * A copy of the object in its unchanged state.
         */
        original: self._deepCopy(obj), //angular.copy(obj),
        /**
         * Returns whether or not the current object has changes from its
         * original state.
         * 
         * @returns {boolean} True if the object has changes from its original state, false otherwise.
         */
        hasChanges: function() {
            var hasChanges = self._doesObjectHaveChanges(this);
           
            // Reset has child changes before rechecking
            this.hasChildChanges = false;
            
            // Check if this object has any children that have changes
            for (var i=0; i<self._objectMap.length; i++) {
                var currentObject = self._objectMap[i];

                if (currentObject === this) continue;

                if (currentObject.rootParent === this.current || currentObject.parent === this.current) {
                    if (self._doesObjectHaveChanges(currentObject)) {
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
        hasChildChanges: false
    };
};

ObjectContext.prototype._doesObjectHaveChanges = function(obj) {
    return obj.changeset.length > 0 ||
           obj.current._objectMeta.status === ObjectContext.ObjectStatus.New ||
           obj.current._objectMeta.status === ObjectContext.ObjectStatus.Modified ||
           obj.current._objectMeta.status === ObjectContext.ObjectStatus.Deleted;
};

/**
 * Checks to see if the provided object has already been added to the context.
 * 
 * @param {object} objectReference An object to test for existance.
 */
ObjectContext.prototype.doesObjectExist = function(objectReference) {
    if (!objectReference) return false;
    
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
ObjectContext.prototype.deleteObject = function(obj, hardDelete) {
    var index = this._getMapIndex(obj);

    if (index === null) {
        throw new Error('Object was not found. Removal failed.');
    }

    // If this object has a status of new (then just remove the object completely)
    // along with any of its children.
    if (this._objectMap[index].current._objectMeta.status === ObjectContext.ObjectStatus.New) {
        hardDelete = true;
    }

    // Are we removing the object or just marking it as deleted
    if (hardDelete === true) {
        if (this._objectMap[index].current._objectMeta.status === ObjectContext.ObjectStatus.New &&
            this._objectMap[index].parent && this._objectMap[index].parent instanceof Array) {
            this._objectMap[index].parent.splice(this._objectMap[index].parent.indexOf(this._objectMap[index].current), 1);
        }
        
        this._objectMap.splice(index, 1);
    }
    else if (this._objectMap[index].current._objectMeta.status !== ObjectContext.ObjectStatus.New) {
        this._objectMap[index].current._objectMeta.status = ObjectContext.ObjectStatus.Deleted;
    }

    // Remove all objects that are a child of this object
    for (var i=this._objectMap.length-1; i>=0; i--) {
        var currentObject = this._objectMap[i];

        if (currentObject.current === obj) {
            continue;
        }

        if (currentObject.rootParent === obj) {
            if (hardDelete === true) {
                this._objectMap.splice(i, 1);
            }
            else if (currentObject.current._objectMeta.status !== ObjectContext.ObjectStatus.New) {
                currentObject.current._objectMeta.status = ObjectContext.ObjectStatus.Deleted;
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
            this._objectMap[i].current._objectMeta.status = ObjectContext.ObjectStatus.Deleted;
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
            return this._deepCopy(this._objectMap[i].original);
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
        throw new Error(this.stringFormat('Invalid object index: {0}', mappedObjectIndex));
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
        throw new Error('Invalid object provided.');
    }

    var mappedObjectIndex = this._getMapIndex(obj);

    if (mappedObjectIndex === null) {
        throw new Error(this.stringFormat('Invalid object index: {0}', mappedObjectIndex));
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
        if (mappedObj.current._objectMeta.status === ObjectContext.ObjectStatus.Deleted) {
            continue;
        }

        // First we need to check if there are any new objects to add from 
        // any arrays within the hierarchy of the currently mapped
        this._addChildren(mappedObj.current, mappedObj.rootParent, true);

        this._checkForChanges(mappedObj);
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
                throw new Error('Property type ("Array") has been modified from the original type.');
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
            currentValue: obj.current[property],
            object: obj.current
        });

        // Update the object status to modified only if it is currently unmodified
        if (obj.current._objectMeta.status === ObjectContext.ObjectStatus.Unmodified) {
            obj.current._objectMeta.status = ObjectContext.ObjectStatus.Modified;
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
        throw new Error('Invalid object provided.');
    }

    var itemIndex = this._getMapIndex(obj);

    if (itemIndex === null) {
        throw new Error('Could not determine object index. Revert changes failed.');
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
        throw new Error('Invalid object provided.');
    }

    // Revert all the changes in the changeset for this object back their original values
    for (var i=0; i<obj.changeset.length; i++) {
        var property = obj.changeset[i].propertyName;

        if (!(obj.current[property] instanceof Array)) {
            obj.current[property] = obj.original[property];
        }
        else {
            for (var x=obj.current[property].length-1; x>=0; x--) {
                if (obj.current[property][x]._objectMeta.status === ObjectContext.ObjectStatus.New) {
                    obj.current[property].splice(x, 1);
                }
            }
        }
    }

    obj.current._objectMeta.status = obj.original._objectMeta.status;
    obj.changeset = [];
    obj.hasChildChanges = false;

    // Now check for any objects that are a child of this object (if it is a parent)
    if (!obj.rootParent) {
        for (var j=this._objectMap.length-1; j>=0; j--) {
            var currentObject = this._objectMap[j];

            if (currentObject === obj) {
                continue;
            }

            if (currentObject.current._objectMeta.status === ObjectContext.ObjectStatus.New) {
                continue;
            }
            else if (currentObject.current._objectMeta.status === ObjectContext.ObjectStatus.Deleted) {
                currentObject.current._objectMeta.status = currentObject.original._objectMeta.status;
            }
            else if (currentObject.rootParent === obj.current) {
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
 * Determines if the provided object has children that are marked as being changed.
 * 
 * @returns {boolean}
 */
ObjectContext.prototype.hasChildChanges = function(obj) {
    if (!obj) {
        throw new Error('Error determing if object has child changes. The object could not be found.');
    }
    
    var mappedObject = this._getMappedObject(obj);
    
    if (!mappedObject) {
        throw new Error('Invalid object provided.');
    }
    
    return mappedObject.hasChildChanges;
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
 * Returns the changeset for a specified mapped object reference. If an object
 * was not provided, then we return the changeset for all objects.
 * 
 * If includeChildren is passed along with an obeject, then we fetch the changsets
 * for all objects in the context, that have the provided object as a parent.
 * 
 * @param {object} obj The object to check for changes against.
 * @param {boolean} includeChildren Pass true to include child changesets.
 * @returns {object} An object with the properties that have changed on the current object.
 */
ObjectContext.prototype.getChangeset = function(obj, includeChildren) {
    var mappedObject = null;

    if (obj) {
        mappedObject = this._getMappedObject(obj);

        if (!mappedObject) {
            throw new Error('The object could not be found.');
        }
    }

    var fullChangeset = mappedObject ? mappedObject.changeset : [];

    if (!obj || (includeChildren && !mappedObject.rootParent)) {
        for (var i=0; i<this._objectMap.length; i++) {
            var current = this._objectMap[i];

            if (obj) {
                if (current === mappedObject) {
                    continue;
                }
                else if (current.rootParent === mappedObject.current && current.changeset.length > 0) {
                    fullChangeset = fullChangeset.concat(current.changeset);
                }
            }
            else {
                fullChangeset = fullChangeset.concat(current.changeset);
            }
        }
    }

    return fullChangeset;
};

/**
 * Returns all objects in the context in their current state.
 * 
 * @returns {array} An Array of objects that exists in the context.
 */
ObjectContext.prototype.getObjects = function() {
    var objects = [];

    for (var i = 0; i < this._objectMap.length; i++) {
        objects.push(this._objectMap[i].current);
    }

    return objects;
};

/**
 * Returns all objects that have status of 'Unmodified'.
 * 
 * @param {boolean} parentsOnly Retrieve only parent objects.
 * @returns {array} An array of objects with a status of 'Unmodified'.
 */
ObjectContext.prototype.getUnmodifiedObjects = function(parentsOnly) {
    return this._getObjectsByStatus(ObjectContext.ObjectStatus.Unmodified, parentsOnly);
};

/**
 * Returns all objects that have status of 'Modified'.
 * 
 * @param {boolean} parentsOnly Retrieve only parent objects.
 * @returns {array} An array of objects with a status of 'Modified'.
 */
ObjectContext.prototype.getModifiedObjects = function(parentsOnly) {
    return this._getObjectsByStatus(ObjectContext.ObjectStatus.Modified, parentsOnly);
};

/**
 * Returns all objects that have status of 'New'.
 * 
 * @param {boolean} parentsOnly Retrieve only parent objects.
 * @returns {array} An array of objects with a status of 'New'.
 */
ObjectContext.prototype.getNewObjects = function(parentsOnly) {
    return this._getObjectsByStatus(ObjectContext.ObjectStatus.New, parentsOnly);
};

/**
 * Returns all objects that have status of 'Deleted'.
 * 
 * @param {boolean} parentsOnly Retrieve only parent objects.
 * @returns {array} An array of objects with a status of 'Deleted'.
 */
ObjectContext.prototype.getDeletedObjects = function(parentsOnly) {
    return this._getObjectsByStatus(ObjectContext.ObjectStatus.Deleted, parentsOnly);
};

/**
 * Returns all objects (in their current state) that have the provided status.
 * 
 * @param {ObjectStatus} status The status of the requested objects.
 * @param {boolean} parentsOnly Retrieve only parent objects.
 * @returns {array} An array of objects with a status of 'status'.
 */
ObjectContext.prototype._getObjectsByStatus = function(status, parentsOnly) {
    if (!status ||
        (status !== ObjectContext.ObjectStatus.New &&
        status !== ObjectContext.ObjectStatus.Modified &&
        status !== ObjectContext.ObjectStatus.Unmodified &&
        status !== ObjectContext.ObjectStatus.Deleted)) {
        throw new Error(this.stringFormat('Invalid status ("{0}"). ' +
              'Status must be either "Unmodified", "Modified", "New", or "Deleted".', status));
    }

    var objects = [];

    for (var i=0; i<this._objectMap.length; i++) {
        var mappedObject = this._objectMap[i];

        if (mappedObject.current._objectMeta.status === status && (!parentsOnly || (parentsOnly === true && !mappedObject.rootParent))) {
            objects.push(this._objectMap[i].current);
        }
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
    var evalChanges = false;
    
    // First we need to determine if there are any objects that are part of an 
    // array need to be removed. If there are, remove them and then reevaluate.
    for (var i=this._objectMap.length-1; i>=0; i--) {
        var currentObject = this._objectMap[i];

        if (currentObject.current._objectMeta.status === ObjectContext.ObjectStatus.Deleted &&
            currentObject.parent && currentObject.parent instanceof Array) {
            currentObject.parent.splice(currentObject.parent.indexOf(currentObject.current), 1);
            this._objectMap.splice(i, 1);
            evalChanges = true;
        }
    }
    
    // Due to the loop above, if there was an object removed from an array, we 
    // need to reevaluate all objects for new changes before applying.
    if (evalChanges) this.evaluate();
    
    // Now go through and remove/set remaining objects
    for (var i=this._objectMap.length-1; i>=0; i--) {
        var currentObject = this._objectMap[i];

        if (currentObject.current._objectMeta.status !== ObjectContext.ObjectStatus.Unmodified) {
            // If this object is marked as deleted, then we remove it from the context
            if (currentObject.current._objectMeta.status === ObjectContext.ObjectStatus.Deleted) {
                this._objectMap.splice(i, 1);
            }
            else {
                // This object was either New or Modified so set it to an Unmodified state
                currentObject.changeset = [];
                currentObject.current._objectMeta.status = ObjectContext.ObjectStatus.Unmodified;
                currentObject.original = this._deepCopy(currentObject.current);
            }
        }
    }

    this.evaluate();
};

/**
 * Output the state and all objects in the context to the console.
 */
ObjectContext.prototype.log = function() {
    console.group('ObjectContext');

    console.log('Has Changes: ' + this.hasChanges());
    console.log('Tracked Objects: ' + this._objectMap.length);

    var parentObjects = [];
    var childObjects = [];
    
    for (var i=0; i<this._objectMap.length; i++) {
        if (!this._objectMap[i].rootParent) {
            parentObjects.push(this._objectMap[i]);
        }
        else {
            childObjects.push(this._objectMap[i]);
        }
    }

    console.group('All Objects');
    console.dir(this._objectMap);
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

/**
 * Creates a deepy copy of the passed in object.
 * 
 * Note: The copy is done through the JavaScript JSON object, and doesn't copy
 * any functions that exists in the object. This includes auto getters/setters.
 * 
 * @param {object} obj The object to copy.
 * @returns {object} A deep copy of the object.
 */
ObjectContext.prototype._deepCopy = function(obj) {
    return JSON.parse(JSON.stringify(obj));
};