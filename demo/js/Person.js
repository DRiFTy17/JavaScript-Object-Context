function Person(id, name, age) {
  this.id = id;
  this.name = name;
  this.age = age;
  this.favoriteSport = {name: 'Disc Golf'};
  this.favoriteColors = [{name: 'Red'}, {name: 'Blue'}];
  this.arrayOfArrays = [[{test: 'testAry'}], [{test: 'testAry2'}]];
  this._objectMeta = {
    status: 'Unmodified', 
    type: 'Person'
  };
}