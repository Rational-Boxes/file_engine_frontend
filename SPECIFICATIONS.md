# Front-end for the file_engine_cpp project

This is a full-stack JavaScript application to provide a full front-end to the file_engine_cpp project using it’s REST API.

This application needs to implement log-in including Oauth2, The access to the File Engine is via a Bearer JWT signed with a Private Key held by this application and the Public Key stored by the File Engine.

The JS back-end also needs to be able to access File Engine for features such as automatic format conversion.

## Technology stack

Back-end for this service can be ExpressJS with TypeScript.

For the front-end let’s use Vue3.js with TypeScript.

## Front-end features

File-browser.

Upload with drag and drop targets and progress bar for large files.

Front-end supports multiple access levels depending on the user’s privileges including a system administrator interface. Menus should respect the user’s level of access.

## Advanced features

Using headless OpenOffice/LibreOffice to generate PDF versions of common office formats.

XeoKit integration for converting CAD formats to Web viewer integration.
