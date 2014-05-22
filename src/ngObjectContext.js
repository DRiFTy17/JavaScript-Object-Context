(function() {
  'use strict';
  
  /**
   * An AngularJS object context/change tracking module.
   * 
   * Configurable methods:
   *     - restrictToSingleInstance
   *     - setEndpointUri
   */
  angular.module('ngObjectContext', []).provider('objectContext', function() {
  
      /**
       * This flag allows the context to be configured to only allow one instance 
       * if set to true.
       */
      var _isSingleton = true;
  
      /**
       * This will hold the one singleton instance of this class if '_isSingleton'
       * is set to true.
       */
      var _instance = null;
  
      /**
       * The endpoint URI to point to when invoking submit/load requests.
       */
      var _endpointUri = null;
  
      /**
       * Call this with true to restrict the context creation to one instance. If
       * set false is passed (the default value) then any calls to create a new
       * context, will generate a new instance.
       */
      this.restrictToSingleContext = function(restrict) {
          _isSingleton = restrict;
      };
  
      /**
       * This is the endpoint that is used when sending requests to the server.
       */
      this.setEndpointUri = function(uri) {
          _endpointUri = uri.trim();
      };
  
      /**
       * The domain context factory function.
       */
      this.$get = ['$rootScope', '$q', '$http', function($rootScope, $q, $http) {
  
          return {
              /**
               * Creates a new ObjectContext instance. If true is passed, then a $digest
               * watch is created, and any digest calls will evaluate our tracked objects
               * for changes.
               * 
               * If we were configured to only one instance of a context, then that will
               * be returned if it exists.
               */
              create: function(evalOnDigest) {
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
               */
              getInstance: function(evalOnDigest) {
                  evalOnDigest = typeof evalOnDigest !== 'undefined' ? !!evalOnDigest : true;
                  return _instance || this.create(evalOnDigest);
              }
          };
  
      }];
  
  });
  
  
  /**
   * Methods:
   *   - evaluate
   *   - add
   *   - remove
   *   - getOriginal
   *   - hasChanges
   *   - revert
   *   - revertAll
   *   - clear
   *   - getChangset
   *   - setAutoEvaluate
   *   - get
   *   - save
   *   - stringFormat
   *   - getObjects
   *   - getObjectBy
   * 
   * Properties:
   *   - isLoading
   *   - isSubmitting
   * @constructor
   */
  function ObjectContext(rootScope, q, http, evalOnDigest, uri) {
      var self = this;
  
      /**
       * The available object types for loaded objects.
       */
      this.ObjectStatus = {
          New: 'New',
          Unmodified: 'Unmodified',
          Modified: 'Modified',
          Deleted: 'Deleted'
      };
  
      /**
       * The URI to request when executing requests to the server.
       */
      this._endpointUri = uri;
  
      /**
       * Add a reference to the Angular $rootScope so we can add digest watches.
       */
      this._rootScope = rootScope;
  
      /**
       * Add a reference to the Angular $q service for promises.
       */
      this._q = q;
  
      /**
       * Add a reference to the Angular $http service for HTTP requests.
       */
      this._http = http;
  
      /**
       * This stores the tracked objects.
       */
      this._objectMap = [];
  
      /**
       * A collection of change listeners that are subscribed to listen for changes.
       */
      this.changeListeners = [];
  
      /**
       * This is used to tell our digest watcher if it should call evaluate whenever
       * that event occurs.
       */
      this._autoEvaluate = !!evalOnDigest;
  
      /**
       * This is a flag that can be queried and used to know if an async request 
       * operation is currently in progress.
       */
      this.isLoading = false;
  
      /**
       * A flag that can be queried and used to know if an async submit operation is in progress
       */
      this.isSubmitting = false;
  
      /**
       * Watch for calls to $digest. When that occurs, we need to evaluate our 
       * tracked objects for changes.
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
   * Add a listener that will be invoked when a change has occured.
   */
  ObjectContext.prototype.setOnChangeListener = function(listener) {
      this.changeListeners.push(listener);
  };
  
  /**
   * Remove a subscribed change listener.
   */
  ObjectContext.prototype.removeOnChangeListener = function(listener) {
      this.changeListeners.splice(this.changeListeners.indexOf(listener), 1);
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
   */
  ObjectContext.prototype.add = function(obj) {
      var self = this;
  
      if (this.doesObjectExist(obj)) {
          throw 'Object already exists in the context.';
      }
  
      // Make sure this object has a meta information property. If not, then add it.
      if (!obj._objectMeta) {
          obj._objectMeta = {
              status: this.ObjectStatus.New,
              type: 'Object'
          }
      }
      else if (obj._objectMeta.status !== this.ObjectStatus.New &&
              obj._objectMeta.status !== this.ObjectStatus.Unmodified &&
              obj._objectMeta.status !== this.ObjectStatus.Modified &&
              obj._objectMeta.status !== this.ObjectStatus.Deleted) {
          throw this.stringFormat('Invalid object status: {0}', obj._objectMeta.status);
      }
  
      // Add this object to the object map by wrapping it in a type we can understand
      this._objectMap.push(createMappedObject(obj));
  
      /**
       * A local helper function to create a mapped object to add to the context 
       * object map. This will wrap the passed in object and add any necessary
       * properties to aid in the change tracking process.
       */
      function createMappedObject(obj) {
          return {
              current: obj,
              original: angular.copy(obj),
              hasChanges: function() {
                  return this.changeset.length > 0 ||
                          this.current._objectMeta.status === self.ObjectStatus.New ||
                          this.current._objectMeta.status === self.ObjectStatus.Modified ||
                          this.current._objectMeta.status === self.ObjectStatus.Deleted;
              },
              changeset: []
          };
      }
  };
  
  /**
   * Checks to see if the provided object is already added to the context.
   */
  ObjectContext.prototype.doesObjectExist = function(objectReference) {
      for (var i = 0; i < this._objectMap.length; i++) {
          if (this._objectMap[i].current === objectReference) {
              return true;
          }
      }
  
      return false;
  };
  
  /**	
   * Removes an existing object from change tracking.
   */
  ObjectContext.prototype.remove = function(obj, hardDelete) {
      var index = this._getMapIndex(obj);
  
      if (index === null) {
          throw 'Object was not found. Removal failed.';
      }
  
      // Check if we are removing this object from the context completely or just
      // marking it as deleted.
      if (hardDelete === true) {
          this._objectMap.splice(index, 1);
      }
      else {
          this._objectMap[index].current._objectMeta.status = this.ObjectStatus.Deleted;
      }
      
      this.evaluate();
  }
  
  /**	
   * Removes all existing objects from the context.
   */
  ObjectContext.prototype.removeAll = function(hardDelete) {
      this._objectMap = [];
      this.evaluate();
  }
  
  /**
   * Private method.
   * 
   * Returns the index of an existing object in the object map.
   */
  ObjectContext.prototype._getMapIndex = function(obj) {
      for (var i = 0; i < this._objectMap.length; i++) {
          if (this._objectMap[i].current === obj) {
              return i;
          }
      }
  
      return null;
  };
  
  /**
   * Returns a copy of the original unchanged object in the state that was in when
   * it was either added or last submitted. If the object is not found then null
   * is returned.
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
   */
  ObjectContext.prototype._getMappedObject = function(obj) {
      var mappedObjectIndex = this._getMapIndex(obj);
  
      if (mappedObjectIndex === null) {
          throw this.stringFormat('Invalid object index: {0}', mappedObjectIndex);
      }
  
      return this._objectMap[mappedObjectIndex];
  };
  
  /**
   * Returns the object status for the specified object reference.
   */
  ObjectContext.prototype.getObjectStatus = function(obj) {
      if (!obj)
          return null;
  
      var mappedObjectIndex = this._getMapIndex(obj);
  
      if (mappedObjectIndex === null) {
          throw this.stringFormat('Invalid object index: {0}', mappedObjectIndex);
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
      for (var i = 0; i < this._objectMap.length; i++) {
          var mappedObj = this._objectMap[i];
  
          // If the object is marked as deleted then we can skip it
          if (mappedObj.current._objectMeta.status === this.ObjectStatus.New || mappedObj.current._objectMeta.status === this.ObjectStatus.Deleted) {
              continue;
          }
  
          this._evalObject(mappedObj.current, mappedObj.current, '');
      }
  
      // Now that the evaluate loop has finished, call any change listeners subscribed to us
      for (var x = 0; x < this.changeListeners.length; x++) {
          var listener = this.changeListeners[x];
  
          if (listener && typeof listener === 'function') {
              listener(this.hasChanges());
          }
      }
  };
  
  /**
   * Recursively runs through the properties of the provided object. Builds
   * up a path to each property that is used to determine its value.
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
          if (typeof obj[property] === 'object') {
              this._evalObject(objectReference, obj[property], this.stringFormat('{0}["{1}"]', path, property));
          }
          else if (obj[property] instanceof Array) {
              this._evalArray(objectReference, obj[property], this.stringFormat('{0}["{1}"]', path, property));
          }
          else {
              this._checkForChanges(objectReference, property, this.stringFormat('{0}["{1}"]', path, property));
          }
      }
  }
  
  /**
   * Recursively runs through the elements of the passed in array, and evaluates
   * each value, based on its type, for any changes from its original state.
   */
  ObjectContext.prototype._evalArray = function(objectReference, ary, path) {
      for (var i = 0; i < ary.length; i++) {
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
              this._checkForChanges(objectReference, property, this.stringFormat('{0}["{1}"]', path, property));
          }
      }
  }
  
  /**
   * Determines if there are any changes to the current object.
   *
   * If a change is found, the property name will be added to the changeset.
   */
  ObjectContext.prototype._checkForChanges = function(objectReference, property, path) {
      var mappedObject = this._getMappedObject(objectReference);
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
          console.log(e);
          console.log("Unable to evaluate current or original values. checkForChanges() failed.");
      }
  }
  
  /**
   * Revert changes for one specific object back to its original state.
   */
  ObjectContext.prototype.revert = function(obj) {
      var itemIndex = this._getMapIndex(obj);
  
      if (itemIndex === null) {
          throw 'Could not determine object index. Revert changes failed.';
      }
  
      var item = this.resetObject(this._objectMap[itemIndex]);
  
      this.evaluate();
  };
  
  /**
   * Revert changes for all tracked objects back to their original state.
   */
  ObjectContext.prototype.revertAll = function() {
      for (var i = 0; i < this._objectMap.length; i++) {
          this.resetObject(this._objectMap[i]);
      }
  
      this.evaluate();
  };
  
  /**
   * Removes any changes to a loaded object and reverts it to its unchanged state.
   */
  ObjectContext.prototype.resetObject = function(obj) {
      this.revertProperties(obj);
      obj.changeset = [];
      obj.current._objectMeta = angular.copy(obj.original._objectMeta);
  };
  
  /**
   * Returns the values of all properties in all objects to their original values.
   * References are left alone, only values are reverted.
   */
  ObjectContext.prototype.revertProperties = function(item) {
      // If this object doesn't have anything in the changeset then there is nothing
      // to revert to.
      if (!item.changeset || item.changeset.length === 0)
          return;
  
      // Loop over the changeset and revert the properties using the path to each property
      for (var i = 0; i < item.changeset.length; i++) {
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
              console.log(e);
              console.log("Unable to evaluate current or original values. revertProperties() failed.");
          }
      }
  };
  
  /**
   * Determines if any of the tracked objects have any active changesets.
   */
  ObjectContext.prototype.hasChanges = function() {
      for (var i = 0; i < this._objectMap.length; i++) {
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
      this.changeListeners = [];
  };
  
  /**
   * Returns the changeset for a specified mapped object reference.
   */
  ObjectContext.prototype.getChangeset = function(obj) {
      var self = this;
      var changes = {};
  
      var mappedObjectIndex = this._getMapIndex(obj);
      var mappedObject = this._getMappedObject(obj);
      if (!mappedObject)
          return changes;
  
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
  
              changes[changedProperty] = {original: originalVal, current: currentVal};
          }
          catch (e) {
              console.log(e);
              console.log("Unable to evaluate current or original values. getChangeset() failed.");
              return {};
          }
      }
  
      return changes;
  };
  
  /**
   * Used for turning on and off automatic change tracking if set to true.
   */
  ObjectContext.prototype.setAutoEvaluate = function(canEval) {
      var self = this;
      this._autoEvaluate = canEval;
  
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
   * sending a request to the server for that type, along with optional 
   * query parameters.
   */
  ObjectContext.prototype.get = function(type, parameters) {
      var self = this;
  
      if (!this._endpointUri) {
          throw 'Load error: No endpoint URI specified.';
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
          self.evaluate();
          
          deferred.resolve(newPerson);
      })();
  
      return deferred.promise;
  };
  
  /**
   * Sends a POST request with the current changes in the context to the server
   * to be saved.
   * 
   * Take the current object in each tracked object, and update its original value
   * and clear the changeset after the request has been completed.
   */
  ObjectContext.prototype.save = function() {
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
   * Gives us the ability to use placeholders in strings and replace their positions
   * with specified corresponding values.
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