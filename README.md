Angular Change Tracker
====================

A change tracking module for AngularJS.

The idea behind this is to load an object (or objects) into the "context" of the application, and have it watch for changes to its properties. This module is useful for .NET developers that are used to the workflow of a client-side domain context through RIA services.

The next phase of this project is to build backend handlers to allow a single submit changes call to be sent, and save all loaded objects to the database. In its current state however, the module can be used to detect changes to any objects on the client-side, and view which properties changed, along with the current changeset.


