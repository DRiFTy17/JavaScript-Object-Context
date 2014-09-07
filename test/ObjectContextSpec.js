'use strict';

describe('ObjectContext', function() {
    var context;

    function Person(id, name, age) {
        this.id = id;
        this.name = name;
        this.age = age;
        this.favoriteSport = {name: 'Golf'};
        this.favoriteColors = [{name: 'Red'}, {name: 'Blue'}];
    }
    
    beforeEach(function() {
        context = new ObjectContext();
    });
    
    describe('getObjects', function() {
        it('should return an array', function() {
            expect(context.getObjects() instanceof Array).toBeTruthy();
        });

        it('should have zero objects if add hasn\'t been called', function() {
            expect(context.getObjects().length).toEqual(0);
            expect(context.getObjects(true).length).toEqual(0);
        });
    });

    describe('add', function() {
        it('should keep reference to added object', function() {
            var obj = {testProperty: 'testValue'};
            context.add(obj);

            expect(context.getObjects(true)[0].current).toBe(obj);
        });

        it('should keep make a deep copy of added object', function() {
            var obj = {testProperty: 'testValue'};
            context.add(obj);

            expect(context.getObjects(true)[0].original).not.toBe(obj);
        });        

        it('should add object with new status', function() {
            var person = new Person(1, 'Tiger Woods', 38);
            context.add(person, true);

            expect(context.getObjectStatus(person)).toEqual(ObjectContext.ObjectStatus.New);
        });

        it('should add object with unmodified status', function() {
            var person = new Person(1, 'Tiger Woods', 38);
            context.add(person);

            expect(context.getObjectStatus(person)).toEqual(ObjectContext.ObjectStatus.Unmodified);
        });

        it('should populate _objectMap after adding object', function() {
            var obj = {testProperty: 'testValue'};
            context.add(obj);

            expect(context.getObjects(true).length).toBe(1);
        });

        it('should load child objects correctly', function() {
            // The Person object has 3 child objects
            context.add(new Person(1, 'Tiger Woods', 38));
            expect(context.getObjects().length).toEqual(4);
        });

        it('should have no parents if is root object', function() {
            var obj = new Person(1, 'Tiger Woods', 38);
            context.add(obj);
            var objects = context.getObjects(true);

            // objects[0] points to the Person objects itself
            expect(objects[0].rootParent).toBe(null);
            expect(objects[0].parent).toBe(null);
        });

        it('should have correct parents if is a direct child', function() {
            var obj = new Person(1, 'Tiger Woods', 38);
            context.add(obj);
            var objects = context.getObjects(true);

            // objects[1] points to the Person.favoriteSport object
            expect(objects[1].rootParent).toBe(obj);
            expect(objects[1].parent).toBe(obj);
        });

        it('should have correct parents if is an indirect child', function() {
            var obj = new Person(1, 'Tiger Woods', 38);
            context.add(obj);
            var objects = context.getObjects(true);

            // objects[2] points to the Person.favoriteColors array
            expect(objects[2].rootParent).toBe(obj);
            expect(objects[2].parent).toBe(obj.favoriteColors);
        });

        it('should throw if invalid object is added', function() {
            var addInvalidObject = function() { 
                context.add(null); 
            };

            expect(addInvalidObject).toThrow();
        });
        
        it('should not throw if same object added twice', function() {
            var addSameObjectTwice = function() {
                var obj = new Person(1, 'Tiger Woods', 38);
                context.add(obj);
                context.add(obj);
            };
            
            expect(addSameObjectTwice).not.toThrow();
        });

        it('should throw if invalid object is provided', function() {
            var addInvalidObject = function() {
                context.add(function() {});
            };

            expect(addInvalidObject).toThrow();
        });
    });
    
    describe('evaluate', function() {
        it('should have no changes if no objects exists', function() {
            expect(context.evaluate().hasChanges()).toEqual(false);
        });

        it('should have changes after modifying an object', function() {
            var obj = new Person(1, 'Tiger Woods', 38);
            context.add(obj);
            obj.name = 'new name';
            context.evaluate();
            
            expect(context.hasChanges()).toEqual(true);
            expect(context.getObjectChangeset(obj).length).toEqual(1);
        });

        it('should no changes if object hasn\'t changed', function() {
            var obj = new Person(1, 'Tiger Woods', 38);
            context.add(obj).evaluate();

            expect(context.hasChanges()).toEqual(false);
            expect(context.hasChanges(obj)).toEqual(false);
            expect(context.hasChildChanges(obj)).toEqual(false);
            expect(context.getObjectStatus(obj)).toEqual(ObjectContext.ObjectStatus.Unmodified);
        });

        it('should have changes after modifying object top level property', function() {
            var obj = new Person(1, 'Tiger Woods', 38);
            context.add(obj);
            obj.name = 'new name';
            context.evaluate();

            expect(context.hasChanges()).toEqual(true);
            expect(context.hasChanges(obj)).toEqual(true);
            expect(context.hasChildChanges(obj)).toEqual(false);
            expect(context.getObjectStatus(obj)).toEqual(ObjectContext.ObjectStatus.Modified);
        });

        it('should have changes after modifying object child object property', function() {
            var obj = new Person(1, 'Tiger Woods', 38);
            context.add(obj);
            obj.favoriteSport.name = 'Disc Golf';
            context.evaluate();

            expect(context.hasChanges()).toEqual(true);
            expect(context.hasChanges(obj)).toEqual(false);
            expect(context.hasChanges(obj.favoriteSport)).toEqual(true);
            expect(context.hasChildChanges(obj)).toEqual(true);
            expect(context.getObjectStatus(obj)).toEqual(ObjectContext.ObjectStatus.Unmodified);
        });

        it('should have changes after modifying object in child array', function() {
            var obj = new Person(1, 'Tiger Woods', 38);
            context.add(obj);
            obj.favoriteColors[0].name = 'Golf';
            context.evaluate();

            expect(context.hasChanges()).toEqual(true);
            expect(context.hasChanges(obj)).toEqual(false);
            expect(context.hasChanges(obj.favoriteColors[0])).toEqual(true);
            expect(context.hasChildChanges(obj)).toEqual(true);
            expect(context.getObjectStatus(obj)).toEqual(ObjectContext.ObjectStatus.Unmodified);
        });

        it('should check for listener functions', function() {
            var listener = jasmine.createSpy('listener spy');
            context.subscribeChangeListener(listener);
            context.add(new Person(1, 'Tiger Woods', 38));
            context.evaluate();

            expect(listener).toHaveBeenCalled();
        });
    });

    describe('rejectChanges', function() {
        it('should not have changes', function() {
            var obj = new Person(1, 'Tiger Woods', 38);
            context.add(obj, true);

            expect(context.evaluate().rejectChanges().hasChanges()).toEqual(false);
        });

        it('should not have changes to changed object', function() {
            var obj = new Person(1, 'Tiger Woods', 38);
            context.add(obj, true);

            expect(context.evaluate().rejectChanges(obj).hasChanges()).toEqual(false);
        });

        it('should reset a deleted object correctly', function() {
            var obj = new Person(1, 'Tiger Woods', 38);
            context.add(obj);
            context.delete(obj);

            expect(context.rejectChanges(obj).hasChanges()).toEqual(false);
        });

        it('should not have changes to changed object but should have changes in context', function() {
            var obj = new Person(1, 'Tiger Woods', 38);
            var objTwo = new Person(1, 'Tiger Woods', 38);

            context.add(obj);
            obj.name = 'new name';
            context.add(objTwo, true);

            context.evaluate();
            context.rejectChanges(obj);

            expect(context.hasChanges(obj)).toEqual(false);
            expect(context.hasChanges()).toEqual(true);
        });

        it('should reject changes to child objects', function() {
            var obj = new Person(1, 'Tiger Woods', 38);
            context.add(obj);
            obj.favoriteSport.name = 'Disc Golf';

            expect(context.evaluate().rejectChanges().hasChanges()).toEqual(false);
        });

        it('should reject changes to child objects inside of arrays when rejecting changes to modified object', function() {
            var obj = new Person(1, 'Tiger Woods', 38);
            context.add(obj);
            obj.favoriteColors[0].name = 'Gold';

            expect(context.evaluate().rejectChanges(obj.favoriteColors[0]).hasChanges(obj.favoriteColors[0])).toEqual(false);
        });

        it('should reject changes to child objects inside of arrays when rejecting all changes', function() {
            var obj = new Person(1, 'Tiger Woods', 38);
            context.add(obj);
            obj.favoriteColors[0].name = 'Gold';

            expect(context.evaluate().rejectChanges().hasChanges()).toEqual(false);
        });
    });

    describe('doesObjectExist', function() {
        it('should return false if invalid object', function() {
            expect(context.doesObjectExist(null)).toEqual(false);
        });
        
        it('should return true if object exists', function() {
            var obj = {};
            context.add(obj);
            expect(context.doesObjectExist(obj)).toEqual(true);
        });
        
        it('should return false if object doesn\'t exist', function() {
            var obj = {};
            context.add(obj);
            expect(context.doesObjectExist({})).toEqual(false);
        });
    });

    describe('delete', function() {
        it('should mark a non-new object as deleted', function() {
            var obj = new Person(1, 'Tiger Woods', 38);
            context.add(obj);

            expect(context.delete(obj).getObjectStatus(obj)).toEqual(ObjectContext.ObjectStatus.Deleted);
        });

        it('should perform a hard delete of objects with a new status', function() {
            var obj = new Person(1, 'Tiger Woods', 38);
            context.add(obj, true);

            expect(context.delete(obj).getObjects().length).toEqual(0);
        });

        it('should mark child objects as deleted', function() {
            var obj = new Person(1, 'Tiger Woods', 38);
            context.add(obj);
            obj.favoriteSport.name = 'Disc Golf';
            context.evaluate();
            context.delete(obj);

            expect(context.getObjectStatus(obj.favoriteSport)).toEqual(ObjectContext.ObjectStatus.Deleted);
        });

        it('should mark child objects inside of arrays as deleted', function() {
            var obj = new Person(1, 'Tiger Woods', 38);
            context.add(obj);
            obj.favoriteColors[0].name = 'Gold';
            context.evaluate();
            context.delete(obj);

            expect(context.getObjectStatus(obj.favoriteColors[0])).toEqual(ObjectContext.ObjectStatus.Deleted);
        });

        it('should throw if object provided does not exists', function() {
            var obj = new Person(1, 'Tiger Woods', 38);
            var deleteUntrackedObject = function() {
                context.delete(obj);
            };

            expect(deleteUntrackedObject).toThrow();
        });
    });

    describe('hasChanges', function() {
        it('should have changes after adding a new obejct', function() {
            var obj = {};
            context.add(obj, true);

            expect(context.hasChanges()).toEqual(true);
            expect(context.hasChanges(obj)).toEqual(true);
        });

        it('should not have changes after adding object', function() {
            var obj = {};
            context.add(obj);

            expect(context.hasChanges()).toEqual(false);
            expect(context.hasChanges(obj)).toEqual(false);
        });

        it('should have changes after modifying object', function() {
            var obj = new Person(1, 'Tiger Woods', 38);
            context.add(obj);
            obj.name = 'new name';
            context.evaluate();

            expect(context.hasChanges()).toEqual(true);
            expect(context.hasChanges(obj)).toEqual(true);
        });

        it('should throw if invalid object is provided', function() {
            var addInvalidObject = function() {
                context.add(null);
            };

            expect(addInvalidObject).toThrow();
        });
    });

    describe('hasChildChanges', function() {
        it('should return false if nothing changed', function() {
            var obj = new Person(1, 'Tiger Woods', 38);
            context.add(obj);
            context.evaluate();

            expect(context.hasChildChanges(obj)).toEqual(false);
        });

        it('should return true if modifying a child property', function() {
            var obj = new Person(1, 'Tiger Woods', 38);
            context.add(obj);
            obj.favoriteSport.name = 'new name';
            context.evaluate();

            expect(context.hasChildChanges(obj)).toEqual(true);
        });

        it('should return true if modifying a child array object property', function() {
            var obj = new Person(1, 'Tiger Woods', 38);
            context.add(obj);
            obj.favoriteColors[1].name = 'Gold';
            context.evaluate();

            expect(context.hasChildChanges(obj)).toEqual(true);
        });

        it('should throw if invalid object is provided', function() {
            var provideInvalidObject = function() {
                context.hasChildChanges(null);
            };

            expect(provideInvalidObject).toThrow();
        });

        it('should throw if untracked object is provided', function() {
            var obj = new Person(1, 'Tiger Woods', 38);

            var provideInvalidObject = function() {
                context.hasChildChanges(obj);
            };

            expect(provideInvalidObject).toThrow();
        });
    });

    describe('acceptChanges', function() {
        it('should not have changes', function() {
            expect(context.acceptChanges().hasChanges()).toEqual(false);
        });

        it('should not have changes with new object', function() {
            var obj = new Person(1, 'Tiger Woods', 38);
            context.add(obj, true);
            expect(context.acceptChanges().hasChanges()).toEqual(false);
        });

        it('should set original object to the values in the current object', function() {
            var obj = new Person(1, 'Tiger Woods', 38);
            context.add(obj);
            obj.name = 'new name';
            context.evaluate();

            expect(context.acceptChanges().getOriginal(obj).name).toEqual(obj.name);
        });

        it('should set original object to the values in the current object for child objects', function() {
            var obj = new Person(1, 'Tiger Woods', 38);
            context.add(obj);
            obj.favoriteSport.name = 'Disc Golf';
            context.evaluate();

            expect(context.acceptChanges().getOriginal(obj.favoriteSport).name).toEqual(obj.favoriteSport.name);
        });

        it('should set original object to the values in the current object for child objects in arrays', function() {
            var obj = new Person(1, 'Tiger Woods', 38);
            context.add(obj);
            obj.favoriteColors[0].name = 'Gold';
            context.evaluate();

            expect(context.acceptChanges().getOriginal(obj.favoriteColors[0]).name).toEqual(obj.favoriteColors[0].name);
        });

        it('should not have changes after accepting deleted objects', function() {
            var obj = new Person(1, 'Tiger Woods', 38);
            context.add(obj);
            context.delete(obj);

            expect(context.acceptChanges().hasChanges()).toEqual(false);
        });
    });

    describe('subscribeChangeListener', function() {
        it('should successfully add listener function', function() {
            var listenerCount = context.subscribeChangeListener(function() {});

            expect(listenerCount).toBe(1);
        });

        it('should throw if listener is not a function', function() {
            var subscribeInvalidListener = function() {
                context.subscribeChangeListener({});
            };

            expect(subscribeInvalidListener).toThrow();
        });
    });

    describe('unsubscribeChangeListener', function() {
        it('should successfully unsubscribe listener function', function() {
            var listener = function() {};
            context.subscribeChangeListener(listener);

            expect(context.unsubscribeChangeListener(listener)).toBe(0);
        });

        it('should throw if listener was not added first', function() {
            var unsubscribeListener = function() {
                var listener = function() {};
                context.unsubscribeChangeListener(listener);
            };

            expect(unsubscribeListener).toThrow();
        });
    });

    describe('clear', function() {
        it('should have no objects loaded', function() {
            expect(context.clear().getObjects().length).toBe(0);
        });

        it('should have no objects loaded after an add', function() {
            context.add({test: 'value'});

            expect(context.clear().getObjects().length).toBe(0);
        });

        it('should clear context after an add, modify, evaluate, clear, add', function() {
            var obj = {propOne: true, propTwo: 'test'};

            context.add(obj);
            obj.propOne = false;
            context.evaluate();
            context.clear();
            context.add(obj);

            expect(context.hasChanges()).toBe(false);
        });
    });

    describe('getOriginal', function() {
        it('should return null when invalid object instance is specified', function() {
            expect(context.getOriginal({})).toBe(null);
        });
    });

    describe('getObjectStatus', function() {
        it('should throw if invalid object is provided', function() {
            expect(context.getObjectStatus).toThrow();
        });

        it('should throw if object doesn\'t exist in context', function() {
            var invalidObject = function() { context.getObjectStatus({}); };
            expect(invalidObject).toThrow();
        });
    });

    describe('getObjectsByType', function() {
        it('should find object correctly', function() {
            context.add(new Person(1, 'Tiger Woods', 38));

            expect(context.getObjectsByType('Person').length).toBe(1);
        });
    });

    describe('query', function() {
        it('should throw if invalid type specified', function() {
            var invalid = function() {
                context.query();
            };

            expect(invalid).toThrow();
        });

        it('should throw if invalid parameters specified', function() {
            var invalid = function() {
                context.query('Type', function() {});
            };

            expect(invalid).toThrow();
        });

        it('should return no objects if none have been added', function() {
            expect(context.query('Object', {prop: 'val'}).length).toBe(0);
        });

        it('should find object in context with correct type', function() {
            context.add(new Person(1, 'Tiger Woods', 38));
            expect(context.query('Person').length).toBe(1);
        });

        it('should find object in context with correct type and parameters', function() {
            context.add(new Person(1, 'Tiger Woods', 38));
            expect(context.query('Person', {name: 'Tiger Woods'}).length).toBe(1); 
        });

        it('should find object in context with correct type and multiple parameters', function() {
            context.add(new Person(1, 'Tiger Woods', 38));
            expect(context.query('Person', {name: 'Tiger Woods', age: 38}).length).toBe(1); 
        });

        it('should not find object in context with incorrect type', function() {
            context.add(new Person(1, 'Tiger Woods', 38));
            expect(context.query('Object', {invalidProperty: 'Tiger Woods'}).length).toBe(0);
        });

        it('should not find object in context with incorrect property', function() {
            context.add(new Person(1, 'Tiger Woods', 38));
            expect(context.query('Person', {invalidProperty: 'Tiger Woods'}).length).toBe(0); 
        });

        it('should not find object in context with invalid property value', function() {
            context.add(new Person(1, 'Tiger Woods', 38));
            expect(context.query('Person', {name: 'Wrong Name'}).length).toBe(0); 
        });
    });

    describe('getObjectChangeset', function() {
        it('should throw if no object is specified', function() {
            expect(context.getObjectChangeset).toThrow();
        });
    });

    describe('getChangeset', function() {
        it('should return empty changeset if context is empty', function() {
            var changesetLength = context.getChangeset()[ObjectContext.ObjectStatus.New].length + 
                                  context.getChangeset()[ObjectContext.ObjectStatus.Modified].length + 
                                  context.getChangeset()[ObjectContext.ObjectStatus.Deleted].length;
            expect(changesetLength).toBe(0);
        });

        it('should add to "New" changeset array', function() {
            var person = new Person(1, 'Tiger Woods', 38);
            context.add(person, true);
            context.evaluate();

            expect(context.getChangeset()[ObjectContext.ObjectStatus.New].length).toBeTruthy();
        });

        it('should add to "Modified" changeset array', function() {
            var person = new Person(1, 'Tiger Woods', 38);
            context.add(person);
            person.name = 'Tiger Woods is Awesome.';
            context.evaluate();

            expect(context.getChangeset()[ObjectContext.ObjectStatus.Modified].length).toBeTruthy();
        });

        it('should add to "Deleted" changeset array', function() {
            var person = new Person(1, 'Tiger Woods', 38);
            context.add(person);
            context.delete(person);
            context.evaluate();

            expect(context.getChangeset()[ObjectContext.ObjectStatus.Deleted].length).toBeTruthy();
        });
    });

    describe('getUnmodifiedObjects', function() {
        it('should find only unmodified objects', function() {
            var tiger = new Person(1, 'Tiger Woods', 38);
            var jack = new Person(2, 'Jack Nicklaus', 74);
            context.add(tiger);
            context.add(jack, true);
            context.evaluate();

            expect(context.getUnmodifiedObjects(true).length).toBe(1);
        });

        it('should find unmodified child objects', function() {
            var tiger = new Person(1, 'Tiger Woods', 38);
            var jack = new Person(2, 'Jack Nicklaus', 74);
            context.add(tiger);
            context.add(jack, true);
            tiger.favoriteSport.name = 'Disc Golf';
            context.evaluate();

            expect(context.getUnmodifiedObjects().length).toBe(3);
        });
    });

    describe('getModifiedObjects', function() {
        it('should no objects if context doesn\t have changes', function() {
            context.evaluate();
            expect(context.getModifiedObjects().length).toBe(0);
        });

        it('should find only modified objects', function() {
            var tiger = new Person(1, 'Tiger Woods', 38);
            var jack = new Person(2, 'Jack Nicklaus', 74);
            context.add(tiger);
            context.add(jack);
            tiger.name = 'New Name';
            context.evaluate();

            expect(context.getModifiedObjects(true).length).toBe(1);
        });
    });

    describe('getNewObjects', function() {
        it('should find no new objects', function() {
            context.add({test: 'value'});
            context.evaluate();

            expect(context.getNewObjects().length).toBe(0);
        });

        it('should find new objects', function() {
            context.add({test: 'value'}, true);
            context.evaluate();

            expect(context.getNewObjects().length).toBe(1);
        });
    });

    describe('getDeletedObjects', function() {
        it('should find no deleted objects', function() {
            context.add({test: 'value'});
            context.evaluate();
            expect(context.getDeletedObjects().length).toBe(0);
        });

        it('should find only deleted objects', function() {
            var tiger = new Person(1, 'Tiger Woods', 38);
            var jack = new Person(2, 'Jack Nicklaus', 74);
            context.add(tiger);
            context.add(jack);
            context.evaluate();
            context.delete(tiger);

            expect(context.getDeletedObjects(true).length).toBe(1);
        });

        it('should find deleted child objects', function() {
            var tiger = new Person(1, 'Tiger Woods', 38);
            var jack = new Person(2, 'Jack Nicklaus', 74);
            context.add(tiger);
            context.add(jack);
            context.evaluate();
            context.delete(tiger);

            expect(context.getDeletedObjects().length).toBe(4);
        });
    });
});