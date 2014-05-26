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
  
  - `returns` A reference to `this` for chaining.

* **`boolean` doesObjectExist(objectReference)**

  Checks to see if the provided object has already been added to the context.

  - `parameter` `objectReference` The object to test for existence.
  - `returns` `true` if the objects exists already, `false` otherwise.  

* **`object` add(obj, rootParent, parent, isStatusNew)**
* **`object` deleteObject(obj, hardDelete)**
* **`boolean` hasChanges()**
* **`boolean` hasChildChanges(obj)**
* **`object` clear()**
* **`array` getObjects(returnMappedObjects)**
* **`array` getUnmodifiedObjects(parentsOnly)**
* **`array` getModifiedObjects(parentsOnly)**
* **`array` getNewObjects(parentsOnly)**
* **`array` getDeletedObjects(parentsOnly)**
* **`array` getObjectsByType(requestedType)**
* **`object` acceptChanges()**
* **`array` getChangeset(obj, includeChildren)**
* **`object` getOriginal(objectReference)**
* **`string` getObjectStatus(obj)**
* **`object` rejectChanges([obj])**
* **`number` subscribeChangeListener(listener)**
* **`number` unsubscribeChangeListener(listener)**
* **`void` log()**

## Examples

Coming soon...

## Development

* Install Jasmine to run unit tests.
