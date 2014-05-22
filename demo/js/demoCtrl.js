(function() {
  'use strict';
  
  demoApp.controller('demoCtrl', 
    ['$scope', 'objectContext', 
    function($scope, objectContext) {
      // Get/create an instance of the object context
      var context = objectContext.getInstance();
      
      // Create a person object and add it to the context
      $scope.person = new Person(1, 'Kieran', 25);
      context.add($scope.person);
      
      // This controls the enabled state of our submit button
      $scope.hasChanges = false;
      
      // Add a change listener so that whenever changes are evaluated, we get notified
      // of the change and can change the state of our submit button.
      context.setOnChangeListener(onContextHasChangesListener);
      function onContextHasChangesListener(hasChanges) {
        $scope.hasChanges = hasChanges;
      }
      
      /**
       * Handles submit button clicks.
       * 
       * Submits all changed objects that have been loaded into the context, to the
       * server and print out the changeset.
       */
      $scope.onSubmit = function() {
        $scope.changeset = context.getChangeset($scope.person);
        console.log($scope.changeset);
        context.save();
      };
      
      /**
       * Returns the currently loaded person object to its original state.
       */
      $scope.onResetCurrent = function() {
        context.revert($scope.person);
        $scope.changeset = null;
      };
      
      /**
       * Reset changes to all objects in the context.
       */ 
      $scope.onReset = function() {
        context.revertAll();
        $scope.changeset = null;
      };
      
      /**
       * Returns the change status from the object context for the currently 
       * selected person.
       */
      $scope.getObjectStatus = function() {
        return context.getObjectStatus($scope.person);
      };
      
      /**
       * Fetches and returns all objects loaded into the context.
       */ 
      $scope.getObjects = function() {
        var objects = context.getObjects();
        $scope.contextObjectCount = objects.length;
        return objects;
      };
      
      /**
       * Handles clicks for the load button.
       * 
       * Loads an object of type Person from the server and adds it to the context.
       */
      $scope.onLoad = function() {
          context.get('Person', {id: 1}).then(function(person) {
            $scope.person = person;
          });
      };
      
      /**
       * Sets the currently selected person.
       */ 
      $scope.setPerson = function(object) {
        $scope.person = object;
      };
      
      /**
       * Clears the context completely to its untouched state. No objects will
       * exist in the context after this.
       */ 
      $scope.onClear = function() {
        context.clear();
        $scope.person = null;
      };
      
      /**
       * Removes the currently selected person from the context.
       */ 
      $scope.onRemove = function() {
        context.remove($scope.person);
        $scope.person = null;
      };
      
      /**
       * Removes all objects from the context. Similar to clear.
       */ 
      $scope.onRemoveAll = function() {
        context.removeAll();
        $scope.person = null;
      };
      
      /**
       * This is a test case for changing the value of an object from code 
       * and calling context.evaluate() manually.
       */
      $scope.onManualChange = function() {
        $scope.person.arrayOfArrays[1][0].test = 'newTestAryValue';
        context.evaluate();
      }
    }
  ]);
})();