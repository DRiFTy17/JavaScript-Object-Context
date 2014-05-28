'use strict';

describe('ObjectContext', function() {
    var context;
    
    beforeEach(function() {
        context = new ObjectContext();
    });
    
    afterEach(function() {
        context.clear();
        context = null;
    });

    describe('add', function() {
        it('should create internal object correctly', function() {
            var obj = {testProperty: 'testValue'};
            context.add(obj);
            var objects = context.getObjects(true);

            expect(objects[0].hasOwnProperty('current')).toEqual(true);
            expect(objects[0].hasOwnProperty('original')).toEqual(true);
            expect(objects[0].hasOwnProperty('hasChanges')).toBe(true);
            expect(objects[0].current).toBe(obj);
        });

        it('should have one object after adding one object', function() {
            var obj = {testProperty: 'testValue'};
            context.add(obj);
            var objects = context.getObjects(true);

            expect(objects.length).toBe(1);
        });

        it('should have correct status after add', function() {
            var objOne = {testProperty: 'testValue'};
            var objTwo = {testProperty: 'testValue'};
            context.add(objOne);
            context.add(objTwo, true);
            var objects = context.getObjects(true);

            expect(objects[0].current._objectMeta.status).toEqual(ObjectContext.ObjectStatus.Unmodified);
            expect(objects[1].current._objectMeta.status).toEqual(ObjectContext.ObjectStatus.New);
        });

        it('should make a copy of the current object', function() {
            var obj = {testProperty: 'testValue'};
            context.add(obj);
            var objects = context.getObjects(true);

            expect(objects[0].original).not.toBe(obj);
        });

        it('should load child objects correctly', function() {
            var obj = {
                propertyOne: 'propertyOne',
                propertyTwo: {one: 'one', two: {one: 'one'}, three: [{one: 'one', two: 'two'}]},
                propertyThree: [{one: 'one'}, {one: 'one', two: {one: 'one'}}]
            };

            context.add(obj);
            var objects = context.getObjects();

            expect(objects.length).toEqual(7);
        });

        it('should have valid parent child relationships', function() {
            var obj = {
                propertyOne: 'propertyOne',
                propertyTwo: {one: 'one', two: {one: 'one'}, three: [{one: 'one', two: 'two'}]}
            };

            context.add(obj);

            var objects = context.getObjects(true);

            expect(objects[0].current).toBe(obj);
            expect(objects[0].rootParent).toBe(null);
            expect(objects[0].parent).toBe(null);

            expect(objects[1].current).toBe(obj.propertyTwo);
            expect(objects[1].rootParent).toBe(obj);
            expect(objects[1].parent).toBe(obj);

            expect(objects[2].current).toBe(obj.propertyTwo.two);
            expect(objects[2].rootParent).toBe(obj);
            expect(objects[2].parent).toBe(obj.propertyTwo);

            expect(objects[3].current).toBe(obj.propertyTwo.three[0]);
            expect(objects[3].rootParent).toBe(obj);
            expect(objects[3].parent).toBe(obj.propertyTwo.three);
        });

        it('should throw if invalid object is added', function() {
            expect(context.add).toThrow();
        });
        
        it('should throw if same object added twice', function() {
            var addSameObjectTwice = function() {
                var obj = {testProperty: 'testValue'};
                context.add(obj);
                context.add(obj);
            };
            
            expect(addSameObjectTwice).toThrow();
        });
        
        it('should throw if object is added with invalid status', function() {
            var addWithInvalidStatus = function() {
                var obj = {testProperty: 'testValue', _objectMeta: {status: 'invalid'}};
                context.add(obj);
            };

            expect(addWithInvalidStatus).toThrow();
        });
    });
    
    describe('evaluate', function() {
        it('should have changes after modifying an added object', function() {
            var obj = {testProperty: 'testValue'};
            context.add(obj);
            obj.testProperty = 'changed';
            context.evaluate();
            
            expect(context.hasChanges()).toEqual(true);
            expect(context.getChangeset(obj).length).toEqual(1);
        });

        it('should reflect changes made to itself and child objects', function() {
            var obj = {
                propertyOne: 'propertyOne',
                propertyTwo: {one: 'one', two: {one: 'one'}, three: [{one: 'one', two: 'two'}]},
                propertyThree: [{one: 'one'}, {one: 'one', two: {one: 'one'}}],
                propertyFour: [],
                propertyFive: {one: [{one: 'delete me'}]}
            };

            context.add(obj);

            // Expect all objects to be unchanged
            expect(context.hasChanges(obj)).toEqual(false);
            expect(context.hasChildChanges(obj)).toEqual(false);
            expect(context.getObjectStatus(obj)).toEqual(ObjectContext.ObjectStatus.Unmodified);

            expect(context.hasChanges(obj.propertyTwo)).toEqual(false);
            expect(context.hasChildChanges(obj.propertyTwo)).toEqual(false);
            expect(context.getObjectStatus(obj.propertyTwo)).toEqual(ObjectContext.ObjectStatus.Unmodified);

            expect(context.hasChanges(obj.propertyTwo.two)).toEqual(false);
            expect(context.getObjectStatus(obj.propertyTwo.two)).toEqual(ObjectContext.ObjectStatus.Unmodified);

            expect(context.hasChanges(obj.propertyTwo.three[0])).toEqual(false);
            expect(context.getObjectStatus(obj.propertyTwo.three[0])).toEqual(ObjectContext.ObjectStatus.Unmodified);

            expect(context.hasChanges(obj.propertyThree[0])).toEqual(false);
            expect(context.getObjectStatus(obj.propertyThree[0])).toEqual(ObjectContext.ObjectStatus.Unmodified);

            expect(context.hasChanges(obj.propertyThree[1])).toEqual(false);
            expect(context.hasChildChanges(obj.propertyThree[1])).toEqual(false);
            expect(context.getObjectStatus(obj.propertyThree[1])).toEqual(ObjectContext.ObjectStatus.Unmodified);

            expect(context.hasChanges(obj.propertyThree[1].two)).toEqual(false);
            expect(context.hasChildChanges(obj.propertyThree[1])).toEqual(false);
            expect(context.getObjectStatus(obj.propertyThree[1].two)).toEqual(ObjectContext.ObjectStatus.Unmodified);

            // Make changes to all objects loaded
            obj.propertyTwo.one = 'one changed';
            obj.propertyTwo.two.one = 'one changed';
            obj.propertyTwo.three[0].two = 'two changed';
            obj.propertyThree[0].one = 'one changed';
            obj.propertyThree[1].one = 'one changed';
            obj.propertyThree[1].two.one = 'one changed';
            obj.propertyFour.push({one: 'one'}); // Add object to array
            obj.propertyFive.one.splice(0, 1); // Remove object from array

            context.evaluate();

            // Expect all objects to be changed
            expect(context.hasChanges(obj)).toEqual(true);
            expect(context.hasChildChanges(obj)).toEqual(true);
            expect(context.getObjectStatus(obj)).toEqual(ObjectContext.ObjectStatus.Modified);

            expect(context.hasChanges(obj.propertyTwo)).toEqual(true);
            expect(context.hasChildChanges(obj.propertyTwo)).toEqual(true);
            expect(context.getObjectStatus(obj.propertyTwo)).toEqual(ObjectContext.ObjectStatus.Modified);

            expect(context.hasChanges(obj.propertyTwo.two)).toEqual(true);
            expect(context.getObjectStatus(obj.propertyTwo.two)).toEqual(ObjectContext.ObjectStatus.Modified);

            expect(context.hasChanges(obj.propertyTwo.three[0])).toEqual(true);
            expect(context.getObjectStatus(obj.propertyTwo.three[0])).toEqual(ObjectContext.ObjectStatus.Modified);

            expect(context.hasChanges(obj.propertyThree[0])).toEqual(true);
            expect(context.getObjectStatus(obj.propertyThree[0])).toEqual(ObjectContext.ObjectStatus.Modified);

            expect(context.hasChanges(obj.propertyThree[1])).toEqual(true);
            expect(context.hasChildChanges(obj.propertyThree[1])).toEqual(true);
            expect(context.getObjectStatus(obj.propertyThree[1])).toEqual(ObjectContext.ObjectStatus.Modified);

            expect(context.hasChanges(obj.propertyThree[1].two)).toEqual(true);
            expect(context.hasChildChanges(obj.propertyThree[1])).toEqual(true);
            expect(context.getObjectStatus(obj.propertyThree[1].two)).toEqual(ObjectContext.ObjectStatus.Modified);

            expect(context.hasChanges(obj.propertyFive)).toEqual(true);
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
});