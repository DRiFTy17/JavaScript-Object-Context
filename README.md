Angular Change Tracker
====================

> **Version**: 1.0

A client-side JavaScript change tracking module.

This module can be used as a standalone container to track client-side JavaScript objects for changes. The ObjectContext object is not dependent on Angular, but it works well with it due to listening for $digest calls to automatically evaluate all loaded objects for changes.

A sandbox demo app that uses the module can be found in [this plunker](http://plnkr.co/edit/YjvD9gb5iUvVVZC41g6s).

To use this without Angular, just add a JavaScript object to the context, and manually call the evaluate function to determine what changed.

* [Getting Started](#getting-started)
* [API Documentation](#api-documentation)
* [Examples](#examples)
* [Development](#development)

## Getting Started

Coming soon...

## API Documentation
* **`object` evaluate()**

  This is the change tracking engine.
  Checks if any of the property values in each of the tracked objects have any changes.
  Will recursively evaluate child properties that are arrays/objects themselves.
  
  - `returns` `object` A reference to `this` for chaining.

* **`boolean` doesObjectExist(objectReference)**

  Checks to see if the provided object has already been added to the context.

  - `parameter` `object` `objectReference` The object to test for existence.
  - `returns` `boolean` if the objects exists already, `false` otherwise.  

* **`object` add(obj, [isStatusNew])**

  Adds an object to the context. Any changes to the properties on this object
  will trigger the context to have changes (after `evaluate()` is called) and notify 
  any subscribers.
  
  This method wraps the passed in object in an object that it can work with. The
  passed in object will be copied so it can store its original state.
  
  If a meta property does not exist on the object then one will be added to it.
  
  Any changes that are made to this object can be seen by querying the `changeset`
  property.
  
  - `parameter` `object` `obj` The object to start tracking.
  - `parameter` `boolean` `isStatusNew` `[optional]` A boolean flag to indicate if this object is to be marked as 'New' or 'Unmodified'. Default value is falsy.
  - `returns` `object` A reference to `this` for chaining.

* **`object` deleteObject(obj, [hardDelete])**

  Marks the provided object as 'Deleted'. If the object doesn't exist, an exception will be thrown.
  
  If `hardDelete` is true, then the object will be instantly removed from the context. Any children of this object will also   be removed.
  
  - `parameter` `object` `obj` The object to delete.
  - `parameters` `boolean` `hardDelete` `[optional]` A boolean flag to determine if the object should be removed or just marked as   'Deleted'. The default value is falsy.
  - `returns` `object` A reference to `this` for chaining.
  - `throws` Errorif the provided object doesn't exist.

* **`boolean` hasChanges()**

  Determines if any of the tracked objects in the context have any active changesets or are marked as 'New', 'Modified', or   'Deleted'.
  
  - `returns` `boolean` True if changes exist, false otherwise.

* **`boolean` hasChildChanges(obj)**

  Determines if the provided object has any children that are marked as being changed.
  
  - `parameter` `object` `obj` The object to check.
  - `returns` `boolean` True if the object has child changes, false otherwise.
  - `throws` Error if the provided object could not be found.

* **`object` clear()**

  Removes all currently tracked objects, and resets the state of the context.
  
  This will usually be called when the state of the application is being destroyed, or if any object that are laoded into    the context are no longer relevant.
  
  - `returns` `object` A reference to `this` for chaining.

* **`array` getObjects(returnMappedObjects)**

  Returns all objects in the context in their current state.
  
  - `parameter` `boolean` `returnMappedObjects` If true is passed, then the internal objects are returned, otherwise the objects as they were added are returned in their current state.
  - `returns` `array` An array of all existing objects.

* **`array` getUnmodifiedObjects(parentsOnly)**

  Returns all objects that have status of 'Unmodified'.
  
  - `parameter` `boolean` `parentsOnly` Retrieve only parent objects if true, false will fetch all objects including children.
  - `returns` `array` An array of objects with a status of 'Unmodified'.

* **`array` getModifiedObjects(parentsOnly)**

  Returns all objects that have status of 'Modified'.
  
  - `parameter` `boolean` `parentsOnly` Retrieve only parent objects if true, false will fetch all objects including children.
  - `returns` `array` An array of objects with a status of 'Modified'.

* **`array` getNewObjects(parentsOnly)**

  Returns all objects that have status of 'New'.
  
  - `parameter` `boolean` `parentsOnly` Retrieve only parent objects if true, false will fetch all objects including children.
  - `returns` `array` An array of objects with a status of 'New'.

* **`array` getDeletedObjects(parentsOnly)**

  Returns all objects that have status of 'Deleted'.
  
  - `parameter` `boolean` `parentsOnly` Retrieve only parent objects if true, false will fetch all objects including children.
  - `returns` `array` An array of objects with a status of 'Deleted'.

* **`array` getObjectsByType(requestedType)**

  Attempts to find all objects in the context that have the `requestedType` noted in their metadata. If an object does not   provide a type, its default type of 'Object' will be used.
  
  - `parameter` `string` `requestedType` The type of objects to fetch from the context.
  - `returns` `array` An array of objects found.

* **`object` acceptChanges()**

  Applies all changes in currently modified objects. After this, all objects that previously had a status that was not       equal to 'Unmodified', will now have an 'Unmodified' status.

  If the object has a status of deleted, then the object will be removed from the context.
  
  Objects that were unchanged are not touched.
  
  - `returns` `object` A reference to `this` for chaining.

* **`array` getChangeset(obj, [includeChildren])**

  Returns the changeset for a specified object. If an object was not provided, then we return the changeset for all objects.
  
  If `includeChildren` is passed along with an object, then we fetch the changesets for all objects in the context, that have the provided object as a parent.
  
  - `parameter` `object` `obj` An object to search for.
  - `parameter` `boolean` `includeChildren` `[optional]` Include children of the provided (if possible)
  - `returns` `array` An array with the properties that have changed.
  - `throws` Error if the provided object could not be found.

* **`object` getOriginal(objectReference)**

  Returns a copy of the original unchanged object in the state that it was in when it was either added or last saved.
     
  If the object is not found then `null` is returned.
  
  - `parameter` `object` `objectReference` The object to search for.
  - `returns` `object` A copy of the original object, or null if not found.

* **`string` getObjectStatus(obj)**

  Gets an object status for the specified object reference.
  
  - `parameter` `object` `obj` The object to search for.
  - `returns` `string` The status of the requested object.
  - `throws` Error if `obj` could not be found.

* **`object` rejectChanges([obj])**

  Rejects changes for an object that exist in the context by setting the values in the object back its original values.
  
  If a single object is passed, it will be tested for existance, and then that one object will be reverted. If no object is   passed, then all objects will be reverted.
  
  - `parameter` `object` `obj` `[optional]` An existing context object to reject changes for.
  - `returns` `object` A reference to this for chaining.
  - `throws` Error if `obj` is provided and could not be found.

* **`number` subscribeChangeListener(listener)** 

  Subcribes the passed listener function that will be invoked when a change has occured.
  
  - `parameter` `function` `listener` A function to invoke when a change occurs to any objects in the context.
  - `returns` `number` The total number of subscribed listeners.
  - `throws` Error if `listener` is not a `function`.

* **`number` unsubscribeChangeListener(listener)**

  Unsubscribes the provided change listener.
  
  - `parameter` `function` `listener` A function reference to unsubscribe.
  - `returns` `number` The total number of subscribed listeners.
  - `throws` Error if `listener` was not subscribed first.

* **`void` log()**

  Output the state and all objects in the context to the console.
  
  - `returns` `object` A reference to this for chaining.

## Examples

Coming soon...

## Development

* Install Jasmine to run unit tests.
* Grunt and Karma will be added soon to automate building and testing.
