# FileEngine Frontend - Technical Architecture Document

## Project Overview

The FileEngine Frontend is a full-stack JavaScript application that provides a web interface to the FileEngine C++ backend. It connects to the FileEngine HTTP proxy service via its REST API, implementing features such as file browsing, drag-and-drop uploads, access control based on user privileges, and administrative interfaces.

## System Architecture

### High-Level Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Browser       │    │   HTTP Proxy     │    │ FileEngine      │
│   Frontend      │◄──►│   (REST API)     │◄──►│   gRPC Server   │
│ (Vue3/Express)  │    │                  │    │                 │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                              │                          │
                              ▼                          ▼
                    ┌──────────────────┐        ┌─────────────────┐
                    │ ExpressJS        │        │ PostgreSQL      │
                    │ Backend Service  │        │ (FileEngine)    │
                    │ (Transformations,│        └─────────────────┘
                    │  Auth, Business  │
                    │   Logic)         │
                    └──────────────────┘
                              │
                    ┌──────────────────┐
                    │  Transformation  │
                    │   Services       │
                    │ (OpenOffice,     │
                    │  XeoKit, etc.)   │
                    └──────────────────┘
                              │
                    ┌──────────────────┐
                    │   LDAP Server    │
                    │ (User Directory  │
                    │   & Roles)       │
                    └──────────────────┘
```

### Technology Stack

**Frontend:**
- **Framework:** Vue3.js with TypeScript
- **State Management:** Pinia (Vue's official state management)
- **UI Components:** PrimeVue or Vuetify for Material Design components
- **Build Tool:** Vite
- **HTTP Client:** Axios with interceptors for JWT handling

**Backend:**
- **Framework:** Express.js with TypeScript
- **Authentication:** OAuth2 with JWT tokens
- **API Client:** Custom API service layer connecting to FileEngine HTTP proxy
- **Build Tool:** TypeScript compiler with ts-node for development

## Authentication Flow

### JWT-Based Authentication
1. User authenticates via OAuth2 provider or local login
2. Frontend receives JWT token signed with the application's private key
3. Frontend stores token in browser's secure storage (with proper security considerations)
4. All API requests include `Authorization: Bearer <token>` header
5. FileEngine HTTP proxy validates against public key stored in database

### Token Management
- **Storage:** HttpOnly cookies for highest security, or sessionStorage for development
- **Refresh:** Automatic token refresh before expiration
- **Validation:** Middleware to validate token existence and expiration
- **Logout:** Token invalidation at backend and frontend cleanup

## API Integration Architecture

### HTTP Proxy Endpoints

The FileEngine HTTP proxy provides the following REST API endpoints:

#### Filesystem Operations
```
GET    /api/v1/filesystem/dir/{uid}           # List directory contents
POST   /api/v1/filesystem/mkdir               # Create directory
DELETE /api/v1/filesystem/rmdir/{uid}         # Remove directory
POST   /api/v1/filesystem/touch               # Create empty file
DELETE /api/v1/filesystem/remove/{uid}        # Remove file
PUT    /api/v1/filesystem/put/{uid}           # Write file data
GET    /api/v1/filesystem/get/{uid}           # Read file data
GET    /api/v1/filesystem/stat/{uid}          # Get file metadata
GET    /api/v1/filesystem/exists/{uid}        # Check file existence
```

#### Version Operations
```
GET    /api/v1/filesystem/versions/{uid}      # List file versions
GET    /api/v1/filesystem/version/{uid}/{version} # Get specific version
```

#### Metadata Operations
```
POST   /api/v1/filesystem/metadata/set        # Set metadata key-value
GET    /api/v1/filesystem/metadata/get/{uid}/{key}  # Get metadata value
GET    /api/v1/filesystem/metadata/all/{uid}  # Get all metadata
DELETE /api/v1/filesystem/metadata/delete/{uid}/{key} # Delete metadata
```

#### Upload Operations
```
GET    /upload                               # Upload form information
POST   /upload                               # File upload with multipart/form-data
POST   /api/v1/upload/chunked/start          # Initiate chunked upload session
POST   /api/v1/upload/chunked/process        # Upload a data chunk
POST   /api/v1/upload/chunked/finalize       # Combine chunks and save file
```

#### ACL and Administrative Operations (Planned)
```
POST   /api/v1/acl/grant                     # Grant permission
DELETE /api/v1/acl/revoke                    # Revoke permission
GET    /api/v1/acl/check/{username}/{uid}/{permission} # Check user permission
GET    /api/v1/acl/list/{uid}                # List ACLs for a resource
GET    /api/v1/auth/user/{username}          # Get user information
GET    /api/v1/auth/role/{rolename}          # Get role information
GET    /api/v1/auth/user/{username}/roles    # Get user's roles
GET    /api/v1/auth/role/{rolename}/permissions # Get role's permissions
```

## Component Architecture

### Core Components Structure
```
src/
├── components/
│   ├── common/             # Reusable components
│   │   ├── Sidebar.vue
│   │   ├── Header.vue
│   │   ├── FileBreadcrumb.vue
│   │   └── LoadingSpinner.vue
│   ├── auth/               # Authentication components
│   │   ├── LoginPage.vue
│   │   ├── OAuth2Handler.vue
│   │   └── JWTManager.vue
│   ├── files/              # File system components
│   │   ├── FileBrowser.vue
│   │   ├── FileCard.vue
│   │   ├── FileList.vue
│   │   ├── DirectoryTree.vue
│   │   └── FilePreview.vue
│   ├── upload/             # Upload components
│   │   ├── DragDropArea.vue
│   │   ├── UploadQueue.vue
│   │   └── ProgressTracker.vue
│   └── admin/              # Administrative components
│       ├── UserManagement.vue
│       ├── RoleManagement.vue
│       └── ACLManagement.vue
├── composables/            # Vue composables
│   ├── useAuth.js
│   ├── useFileOperations.js
│   ├── useACL.js
│   └── useUpload.js
├── stores/                 # Pinia stores
│   ├── auth.js
│   ├── files.js
│   ├── upload.js
│   └── user.js
├── services/               # API services
│   ├── api.js
│   ├── authService.js
│   ├── fileService.js
│   └── uploadService.js
└── utils/                  # Utility functions
    ├── jwt.js
    ├── fileUtils.js
    └── constants.js
```

## Security Considerations

### Authentication Security
- JWT tokens are signed with application's private key and validated by FileEngine against public key
- Secure token storage (HttpOnly cookies preferred)
- Token expiration and refresh mechanisms
- CSRF protection with proper headers

### Data Security
- All file operations go through the FileEngine backend with ACL enforcement
- Client-side validation with server-side enforcement
- Proper error handling without information leakage

### Communication Security
- HTTPS required for production
- CORS configuration restricted to allowed origins
- Request/response sanitization

## Performance Considerations

### File Browser Performance
- Virtual scrolling for large directories
- Caching of directory contents and file metadata
- Lazy loading of file previews
- Optimized API requests with pagination for large datasets

### Upload Performance
- Chunked upload for large files (100MB+)
- Progress tracking with real-time feedback
- Concurrent upload handling
- Resume capability for interrupted uploads

### State Management
- Efficient state updates with Pinia
- Selective reactivity to prevent unnecessary re-renders
- Memory management for large file lists

## Development Phases

### Phase 1: Core Authentication and File Browser
- Implement OAuth2 login flow
- Create basic file browser with directory listing
- Implement JWT token management
- Basic file operations (create, delete)

### Phase 2: Upload Functionality
- Drag-and-drop upload interface
- Progress tracking for uploads
- Chunked upload for large files
- Upload queue management

### Phase 3: Advanced Features
- File preview and metadata display
- Version management
- ACL management interfaces
- Administrative tools

### Phase 4: Polish and Optimization
- Performance optimization
- UI/UX improvements
- Advanced file operations
- Comprehensive testing

This architecture ensures the frontend properly integrates with the FileEngine backend while maintaining security, performance, and usability standards.