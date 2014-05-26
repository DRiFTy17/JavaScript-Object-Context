function Person(id, name, age) {
  this.id = id;
  this.name = name;
  this.age = age;
  this.favoriteSport = {name: 'Disc Golf'};
  this.favoriteColors = [{name: 'Red'}, {name: 'Blue'}];
  this._objectMeta = {
    status: ObjectContext.ObjectStatus.Unmodified, 
    type: 'Person'
  };
}