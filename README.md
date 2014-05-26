Angular Change Tracker
====================

A client-side change tracking module built with JavaScript and AngularJS.

This module can be used as a standalone container to track client-side JavaScript objects for changes. The ObjectContext object is not dependent on Angular, but it works well with it due to listening for $digest calls to automatically evaluate all loaded objects for changes.

A sandbox demo app that uses the module can be found in [this plunker](http://plnkr.co/edit/YjvD9gb5iUvVVZC41g6s).

To use this without Angular, just add a JavaScript object to the context, and manually call the evaluate function to determine what changed.
