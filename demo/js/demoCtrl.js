(function() {
  'use strict';
  
  angular.module('demoApp').controller('demoCtrl', 
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
      context.subscribeChangeListener(onContextHasChangesListener);
      function onContextHasChangesListener(hasChanges) {
        $scope.hasChanges = hasChanges;
      }

      context.log();
      
      $scope.onLogContext = function() {
          context.log();
      };
      
      /**
       * Handles submit button clicks.
       * 
       * Submits all changed objects that have been loaded into the context, to the
       * server and print out the changeset.
       */
      $scope.onApplyChanges = function() {
          if ($scope.person) {
              console.log('Changeset: ', context.getChangeset($scope.person, true));
          }

          context.applyChanges();
          if (!context.doesObjectExist($scope.person)) {
              $scope.person = null;
          }
          context.log();
      };
      
      /**
       * Returns the currently loaded person object to its original state.
       */
      $scope.onResetCurrent = function(object) {
        context.revert(object);
      };
      
      /**
       * Reset changes to all objects in the context.
       */ 
      $scope.onReset = function() {
        context.revertAll();
      };
      
      /**
       * Returns the change status from the object context for the currently 
       * selected person.
       */
      $scope.getObjectStatus = function() {
        if (!$scope.person) return undefined;
        return context.getObjectStatus($scope.person);
      };
      
      /**
       * Fetches and returns all objects loaded into the context.
       */ 
      $scope.getPeople = function() {
        var people = [];
        var objects = context.getObjects();
        
        for (var i=0; i<objects.length; i++) {
            if (objects[i]._objectMeta.type === 'Person') {
                people.push(objects[i]);
            }
        }
        
        $scope.contextObjectCount = people.length;
        
        return people;
      };
      
      /**
       * Handles clicks for the load button.
       * 
       * Loads an object of type Person from the server and adds it to the context.
       */
      $scope.onLoad = function() {
          var newPerson = new Person(new Date().getTime(), "Brad", 51);
          newPerson._objectMeta.status = ObjectContext.ObjectStatus.New;
          context.add(newPerson);
          
          $scope.person = newPerson;
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
      $scope.onRemove = function(object) {
        context.deleteObject(object);
      };
      
      $scope.onRemoveColor = function(color) {
          context.deleteObject(color);
      };
      
      /**
       * Removes all objects from the context. Similar to clear.
       */ 
      $scope.onRemoveAll = function() {
        context.removeAll(true);
        $scope.person = null;
      };
      
      /**
       * Adds a color to the colors collection.
       */
      $scope.onAddColor = function() {
        if (!$scope.person) return; 
        $scope.person.favoriteColors.push({name: 'Gold'});
        context.evaluate();
      };
      
      $scope.hasChildChanges = function() {
          if (!$scope.person) return '';
          return context.hasChildChanges($scope.person);
      };
    }
  ]);
})();