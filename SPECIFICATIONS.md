# Front-end for the file_engine_cpp project

This is a full-stack JavaScript application to provide a full front-end to the file_engine_cpp project using
the JavaScript/TypeScript library.

This application needs to implement log-in including Oauth2. User account information and Roles under
each Tenant will be stored in an LDAP service.

## Technology stack

Back-end for this service can be ExpressJS with TypeScript.

For the front-end let’s use Vue3.js with TypeScript.

## Front-end features

File-browser.

Upload with drag and drop targets and progress bar for large files.

Front-end supports multiple access levels depending on user privileges including a
system administrator interface. Menus should respect the user’s level of access.

## User and permissions in LDAP

User accounts in LDAP are stored under `ou=users`

Tenants are implemented as `ou` under `ou=tenants`, under each one the user groups are implemented as
`groupOfNames` entities for the Roles.

### Default role definitions:

- `users` Basic access, can read files
- `contribuators` write access
- `administrators` full access for administration

## Advanced features

Using headless OpenOffice/LibreOffice to generate PDF versions of common office formats.

XeoKit integration for converting CAD formats to Web viewer integration.
