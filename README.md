# FileEngine Frontend

## Overview

FileEngine Frontend is a modern web application built with Vue3 and ExpressJS that provides a comprehensive file management interface for the FileEngine C++ backend system. The application features advanced file operations, format conversion capabilities, CAD model visualization, and robust authentication systems.

## Features

### Core Functionality
- **File Management**: Complete file browsing, uploading, and management capabilities
- **Drag-and-Drop Uploads**: Intuitive drag-and-drop interface with progress tracking
- **Format Conversion**: Automatic conversion of documents to PDF using LibreOffice
- **CAD Visualization**: 3D CAD model viewing using Xeokit integration
- **Image Optimization**: Automatic image compression and format conversion
- **Role-Based Access Control**: Granular permissions system with user, editor, and admin levels
- **OAuth2 Authentication**: Secure authentication with PKCE flow

### Architecture Highlights
- **Frontend**: Vue3 with TypeScript, Pinia for state management
- **Backend**: ExpressJS with transformation services
- **API Integration**: Seamless integration with FileEngine C++ HTTP proxy
- **Security**: JWT-based authentication with auto-refresh
- **Testing**: Full test coverage with TDD approach

## Prerequisites

### System Requirements
- **Node.js**: Version 18.x or higher
- **npm**: Version 8.x or higher
- **Git**: For version control
- **Python**: Version 3.x (for LibreOffice integration)
- **LibreOffice/OpenOffice**: For document conversion (optional)
- **FileEngine C++ Backend**: Running HTTP proxy service

### Optional Dependencies
- **FreeCAD**: For advanced CAD format conversion
- **Xeokit**: Integrated via CDN (no local installation required)

## Installation

### 1. Clone the Repository
```bash
git clone https://github.com/your-organization/fileengine-frontend.git
cd fileengine-frontend
```

### 2. Install Dependencies

#### Frontend Dependencies
```bash
# Install frontend dependencies
npm install
```

#### Backend Dependencies
```bash
# Install backend dependencies
cd express-backend
npm install
cd ..
```

## Configuration

### 1. Environment Variables

#### Frontend Configuration
Create a `.env` file in the frontend root directory:

```bash
# FileEngine frontend configuration
VUE_APP_FILEENGINE_API_URL=http://localhost:8081
VUE_APP_OAUTH_CLIENT_ID=your-oauth-client-id
VUE_APP_OAUTH_SCOPE="openid profile email"
VUE_APP_OAUTH_PROVIDERS="google,github,ldap"
VUE_APP_FRONTEND_URL=http://localhost:3000
```

#### Backend Configuration
Create a `.env` file in the `express-backend` directory:

```bash
# FileEngine ExpressJS backend configuration
PORT=8081
FILEENGINE_API_URL=http://localhost:8080
JWT_SECRET=your-super-secret-jwt-signing-key-here
OPENOFFICE_PATH=/usr/bin/libreoffice
FRONTEND_URL=http://localhost:3000
CACHE_DIR=./cache
UPLOAD_LIMIT=52428800
TEMP_DIR=/tmp/fileengine
CAD_VIEWER_OUTPUT=./cad-viewers
```

### 2. Configuration Options

#### Frontend Environment Variables
- `VUE_APP_FILEENGINE_API_URL`: URL of the FileEngine HTTP proxy backend
- `VUE_APP_OAUTH_CLIENT_ID`: OAuth client ID for authentication
- `VUE_APP_OAUTH_SCOPE`: OAuth scopes to request
- `VUE_APP_OAUTH_PROVIDERS`: Comma-separated list of OAuth providers
- `VUE_APP_FRONTEND_URL`: URL of the frontend application

#### Backend Environment Variables
- `PORT`: Port on which the ExpressJS backend will run (default: 8081)
- `FILEENGINE_API_URL`: URL of the FileEngine C++ HTTP proxy (default: http://localhost:8080)
- `JWT_SECRET`: Secret key for signing JWT tokens
- `OPENOFFICE_PATH`: Path to LibreOffice/OpenOffice executable (optional)
- `FRONTEND_URL`: URL of the frontend for CORS configuration
- `CACHE_DIR`: Directory for caching transformed files (default: ./cache)
- `UPLOAD_LIMIT`: Maximum file upload size in bytes (default: 52428800)
- `TEMP_DIR`: Temporary directory for file processing (default: /tmp/fileengine)
- `CAD_VIEWER_OUTPUT`: Directory for CAD viewer outputs (default: ./cad-viewers)

## Running the Application

### Development Mode

#### 1. Start the FileEngine Backend
Ensure the FileEngine C++ backend is running:

```bash
# Start the FileEngine gRPC server and HTTP proxy
# This step depends on your FileEngine setup
```

#### 2. Start the ExpressJS Backend
```bash
cd express-backend
npm run dev
```

#### 3. Start the Frontend Development Server
In a separate terminal:

```bash
npm run dev
```

The application will be available at `http://localhost:3000`.

### Production Mode

#### Build and Serve Frontend
```bash
# Build the frontend for production
npm run build

# Serve the build files
npx serve -s dist -l 80
```

#### Start Backend Server
```bash
cd express-backend
npm start
```

## Project Structure

```
fileengine-frontend/
├── express-backend/           # ExpressJS backend service
│   ├── app.js                 # Main application entry point
│   ├── routes/                # API route definitions
│   │   ├── auth.js            # Authentication routes
│   │   ├── files.js           # File operations routes
│   │   ├── transform.js       # File transformation routes
│   │   └── cad.js             # CAD conversion routes
│   ├── services/              # Business logic services
│   │   ├── fileService.js     # File operations service
│   │   ├── transformService.js # Format conversion service
│   │   └── cadService.js      # CAD conversion service
│   └── package.json           # Backend dependencies
├── src/                      # Vue3 frontend source
│   ├── components/            # Vue components
│   ├── composables/          # Vue composables
│   ├── stores/               # Pinia stores
│   │   ├── auth.ts           # Authentication store
│   │   ├── files.ts          # File management store
│   │   ├── upload.ts         # Upload management store
│   │   └── fileTransform.ts  # File transformation store
│   ├── services/             # API service layer
│   ├── utils/                # Utility functions
│   ├── views/                # Page components
│   ├── router/               # Vue Router configuration
│   └── tests/                # Test files
├── public/                   # Static assets
├── package.json              # Frontend dependencies and scripts
├── vite.config.ts            # Vite build configuration
├── tsconfig.json             # TypeScript configuration
└── README.md                 # This file
```

## Key Features

### File Management
- **Directory Navigation**: Intuitive browsing with breadcrumbs
- **File Operations**: Create, delete, rename, and download files
- **Multi-Selection**: Select multiple items for batch operations
- **Search**: Find files and directories quickly

### Format Conversion
- **Document to PDF**: Automatic conversion using LibreOffice
- **Image Optimization**: Compress and convert images
- **CAD to Web Viewer**: Convert CAD models to Xeokit viewers
- **Batch Processing**: Convert multiple files in a single operation

### CAD Visualization
- **3D Model Support**: STEP, STL, OBJ, FBX, and other formats
- **WebGL Rendering**: Hardware-accelerated 3D visualization
- **Interactive View**: Rotate, zoom, and pan CAD models
- **Mark-up Tools**: Annotate and highlight model features

### Authentication & Authorization
- **OAuth2 with PKCE**: Secure authentication flow
- **JWT Management**: Automatic token refresh and storage
- **Role-Based Access**: User, editor, and admin levels
- **Session Management**: Automatic session handling

## API Integration

The frontend integrates with:
- **FileEngine HTTP Proxy**: Core file operations via REST API
- **ExpressJS Backend**: Transformation services and advanced operations
- **OAuth Providers**: Google, GitHub, LDAP, and others

### API Endpoints Used
- `/api/v1/filesystem/*`: File and directory operations
- `/api/transform/*`: Format conversion operations
- `/api/cad/*`: CAD transformation operations
- `/auth/*`: Authentication operations

## Testing

The project includes comprehensive test coverage with:
- **Unit Tests**: For individual components and services
- **Integration Tests**: For API interactions and store operations
- **Component Tests**: For UI components and user interactions

### Running Tests
```bash
# Run all frontend tests
npm run test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Run a specific test file
npm run test -- src/tests/stores/auth.test.ts
```

### Test Structure
```
src/tests/
├── stores/              # Pinia store tests
│   ├── auth.test.ts     # Authentication store tests
│   ├── files.test.ts    # File store tests
│   ├── upload.test.ts   # Upload store tests
│   └── fileTransform.test.ts # Transformation store tests
├── services/            # Service tests
│   ├── apiService.test.ts # API service tests
│   └── fileService.test.ts # File service tests
├── views/               # Component tests
│   └── FileBrowserView.test.ts # File browser component tests
└── utils/               # Utility function tests
    ├── jwt.test.ts      # JWT utilities tests
    └── tokenStorage.test.ts # Token storage tests
```

## Security

### Authentication Security
- **JWT Tokens**: Secure token-based authentication
- **PKCE Flow**: Enhanced OAuth2 security for public clients
- **Token Refresh**: Automatic token refresh before expiration
- **Secure Storage**: Proper token storage and cleanup

### Data Security
- **Input Validation**: Comprehensive input validation
- **File Type Checking**: MIME type validation for uploads
- **Size Limits**: Configurable file size restrictions
- **Rate Limiting**: Built-in protection against abuse

### Communication Security
- **HTTPS Recommended**: Production deployment guidance
- **CORS Configuration**: Proper cross-origin resource sharing
- **API Security**: Bearer token authentication for all endpoints

## Performance

### Frontend Optimizations
- **Code Splitting**: Lazy loading of components
- **Virtual Scrolling**: Efficient handling of large directories
- **Caching**: In-memory caching of frequently accessed data
- **Tree Shaking**: Removal of unused code

### Backend Optimizations
- **File Caching**: Cache transformed files to reduce processing
- **Asynchronous Processing**: Non-blocking file operations
- **Memory Management**: Efficient handling of large files
- **Connection Pooling**: Optimized API connection handling

## Development

### Available Scripts

#### Frontend Scripts
```bash
npm run dev                      # Start development server
npm run build                    # Build for production
npm run preview                  # Preview production build
npm run test                     # Run tests
npm run test:ui                  # Run tests with UI
npm run test:run                 # Run tests once
npm run test:coverage           # Run tests with coverage
npm run lint                     # Lint code
npm run type-check              # Check TypeScript types
```

#### Backend Scripts
```bash
npm run dev                      # Start backend in development mode
npm run start                    # Start backend in production mode
npm run test                     # Run backend tests
npm run lint                     # Lint backend code
```

### Development Workflow
1. **Code**: Implement features with TypeScript
2. **Test**: Write tests following TDD practices
3. **Lint**: Maintain code quality with ESLint
4. **Type Check**: Ensure type safety
5. **Commit**: Follow conventional commit messages

## Deployment

### Environment Setup
1. Configure environment variables for your deployment environment
2. Set up proper domain names and SSL certificates
3. Configure reverse proxy (Nginx, Apache, etc.)
4. Set up monitoring and logging

### Production Considerations
- **Security**: Use HTTPS, secure JWT secrets, and proper CORS
- **Performance**: Enable gzip compression and caching headers
- **Monitoring**: Set up error tracking and performance monitoring
- **Backups**: Regular backup of configuration files

## Contributing

### Development Guidelines
- Follow existing code style and conventions
- Write tests for new features and bug fixes
- Document public APIs and complex functionality
- Use TypeScript for type safety
- Follow Vue3 composition API patterns

### Pull Request Process
1. Fork the repository
2. Create a feature branch
3. Make your changes with tests
4. Update documentation if needed
5. Submit a pull request with description

## Support

### Getting Help
- **Issues**: Report bugs or request features
- **Documentation**: Check the project documentation
- **Community**: Join the community for support

### Troubleshooting
Common issues and solutions:
- Authentication problems: Verify OAuth configuration
- File operations failing: Check FileEngine backend connectivity
- CAD conversion issues: Ensure LibreOffice is properly installed
- Performance problems: Monitor cache and temporary file directories

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- **Vue.js Team**: For the excellent Vue3 framework
- **Pinia Team**: For the intuitive state management solution
- **Xeokit**: For the powerful 3D visualization library
- **FileEngine Team**: For the robust backend system
- **Open Source Community**: For the various libraries and tools used

## Versioning

We use [Semantic Versioning](http://semver.org/) for this project. For the versions available, see the [tags on this repository](https://github.com/your-organization/fileengine-frontend/tags).

## Authors

- **Project Team** - Initial work and ongoing development
- See also the list of [contributors](https://github.com/your-organization/fileengine-frontend/contributors) who participated in this project.

---

**Note**: This project is actively maintained and accepts contributions. For major changes, please open an issue first to discuss what you would like to change.