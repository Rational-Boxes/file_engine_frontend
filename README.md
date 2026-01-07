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
- **Role-Based Access Control**: Granular permissions system with user, contributor, and admin levels based on LDAP roles
- **Authentication**: Secure authentication with OAuth2 and LDAP integration

### Architecture Highlights
- **Frontend**: Vue3 with TypeScript, Pinia for state management
- **Backend**: ExpressJS with transformation services and LDAP integration
- **Authentication**: OAuth2 and LDAP with JWT-based tokens
- **API Integration**: Seamless integration with FileEngine C++ HTTP proxy
- **Security**: JWT-based authentication with auto-refresh and LDAP role management
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

## Running with Docker Compose

For easier deployment and management, you can run the FileEngine frontend system using Docker Compose.

### Docker Compose Configuration

Create a `docker-compose.yml` file in the project root:

```yaml
version: '3.8'

services:
  frontend:
    build:
      context: .
      dockerfile: Dockerfile.frontend
    ports:
      - "3000:80"
    environment:
      - VUE_APP_FILEENGINE_API_URL=http://backend:8081
      - VUE_APP_FRONTEND_URL=http://localhost:3000
    depends_on:
      - backend
    restart: unless-stopped

  backend:
    build:
      context: .
      dockerfile: Dockerfile.backend
    ports:
      - "8081:8081"
    environment:
      - PORT=8081
      - FILEENGINE_API_URL=http://host.docker.internal:8080  # For connecting to FileEngine backend running on host
      - JWT_SECRET=your-super-secret-jwt-signing-key-here
      - OPENOFFICE_PATH=/usr/bin/libreoffice
      - FRONTEND_URL=http://localhost:3000
      - CACHE_DIR=/app/cache
      - UPLOAD_LIMIT=52428800
      - TEMP_DIR=/tmp/fileengine
      - CAD_VIEWER_OUTPUT=/app/cad-viewers
    volumes:
      - backend_cache:/app/cache
      - backend_temp:/tmp/fileengine
      - backend_cad:/app/cad-viewers
    restart: unless-stopped

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
      - ./ssl:/etc/nginx/ssl  # For HTTPS configuration
    depends_on:
      - frontend
      - backend
    restart: unless-stopped

volumes:
  backend_cache:
  backend_temp:
  backend_cad:
```

### Dockerfiles

#### Frontend Dockerfile (`Dockerfile.frontend`)

```Dockerfile
FROM node:18-alpine AS build

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Production stage
FROM nginx:alpine

# Copy build output to nginx html directory
COPY --from=build /app/dist /usr/share/nginx/html

# Copy nginx configuration
COPY nginx-frontend.conf /etc/nginx/nginx.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
```

#### Backend Dockerfile (`Dockerfile.backend`)

```Dockerfile
FROM node:18-alpine

# Install LibreOffice for document conversion
RUN apk add --no-cache \
    libreoffice \
    python3 \
    py3-pip

# Set working directory
WORKDIR /app

# Copy package files
COPY express-backend/package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY express-backend/ .

# Create necessary directories
RUN mkdir -p /app/cache /tmp/fileengine /app/cad-viewers

# Expose port
EXPOSE 8081

# Start the server
CMD ["npm", "start"]
```

#### Nginx Configuration (`nginx-frontend.conf`)

```nginx
events {
    worker_connections 1024;
}

http {
    server {
        listen 80;
        server_name localhost;

        # Frontend static files
        location / {
            root /usr/share/nginx/html;
            try_files $uri $uri/ /index.html;
        }

        # API proxy to backend
        location /api {
            proxy_pass http://backend:8081;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_cache_bypass $http_upgrade;
        }

        # For OAuth callbacks if needed
        location /oauth {
            proxy_pass http://backend:8081;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }

        # Health check endpoint
        location /health {
            access_log off;
            return 200 "healthy\n";
            add_header Content-Type text/plain;
        }
    }
}
```

### Environment Configuration for Docker

Create a `.env.docker` file for Docker-specific environment variables:

```bash
# Frontend environment for Docker
VUE_APP_FILEENGINE_API_URL=http://backend:8081
VUE_APP_OAUTH_CLIENT_ID=your-oauth-client-id
VUE_APP_OAUTH_SCOPE="openid profile email"
VUE_APP_OAUTH_PROVIDERS="google,github,ldap"
VUE_APP_FRONTEND_URL=http://localhost:3000

# Backend environment for Docker
PORT=8081
FILEENGINE_API_URL=http://fileengine:8080  # Adjust based on your FileEngine setup
JWT_SECRET=your-super-secret-jwt-signing-key-here
OPENOFFICE_PATH=/usr/bin/libreoffice
FRONTEND_URL=http://localhost:3000
CACHE_DIR=/app/cache
UPLOAD_LIMIT=52428800
TEMP_DIR=/tmp/fileengine
CAD_VIEWER_OUTPUT=/app/cad-viewers
```

### Running with Docker Compose

1. **Build and start the services:**
```bash
# Build and start all services
docker-compose up -d --build

# View logs
docker-compose logs -f
```

2. **Access the application:**
   - Frontend: `http://localhost:3000`
   - Backend API: `http://localhost:8081`
   - Health check: `http://localhost/health` (through nginx)

3. **Stop the services:**
```bash
# Stop all services
docker-compose down

# Stop and remove volumes (data will be lost)
docker-compose down -v
```

4. **Update configurations:**
```bash
# Rebuild and restart after code changes
docker-compose up -d --build

# Update only the frontend
docker-compose build frontend
docker-compose restart frontend
```

### Production Docker Compose Configuration

For production deployments, create a separate `docker-compose.prod.yml`:

```yaml
version: '3.8'

services:
  frontend:
    build:
      context: .
      dockerfile: Dockerfile.frontend
    ports:
      - "443:80"
    environment:
      - VUE_APP_FILEENGINE_API_URL=https://api.yourdomain.com
      - VUE_APP_FRONTEND_URL=https://yourdomain.com
    depends_on:
      - backend
    restart: unless-stopped
    networks:
      - frontend

  backend:
    build:
      context: .
      dockerfile: Dockerfile.backend
    ports:
      - "8081:8081"
    environment:
      - PORT=8081
      - FILEENGINE_API_URL=https://fileengine.yourdomain.com
      - JWT_SECRET=${JWT_SECRET}
      - OPENOFFICE_PATH=/usr/bin/libreoffice
      - FRONTEND_URL=https://yourdomain.com
      - CACHE_DIR=/app/cache
      - UPLOAD_LIMIT=52428800
      - TEMP_DIR=/tmp/fileengine
      - CAD_VIEWER_OUTPUT=/app/cad-viewers
    volumes:
      - /volume1/backend_cache:/app/cache
      - /volume1/backend_temp:/tmp/fileengine
      - /volume1/backend_cad:/app/cad-viewers
    restart: unless-stopped
    networks:
      - backend

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.prod.conf:/etc/nginx/nginx.conf
      - /etc/letsencrypt:/etc/nginx/ssl:ro
    depends_on:
      - frontend
      - backend
    restart: unless-stopped
    networks:
      - frontend
      - backend

networks:
  frontend:
    driver: bridge
  backend:
    driver: bridge

volumes:
  backend_cache:
  backend_temp:
  backend_cad:
```

### Running Production Setup

```bash
# Start production setup
docker-compose -f docker-compose.prod.yml up -d --build

# With environment variables from file
docker-compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
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
- **LDAP Integration**: Integration with LDAP for user authentication and role management
- **JWT Management**: Automatic token refresh and storage
- **Role-Based Access**: User, contributor, and admin levels based on LDAP roles
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

## Testing with Public URLs using Ngrok

For testing purposes, you can use Ngrok to create public URLs for your locally running services. This is especially useful for OAuth callback testing and allowing external access to the system.

### Installing Ngrok
1. Download Ngrok from https://ngrok.com/
2. Sign up for a free account to get an authentication token
3. Install the binary and authenticate:

```bash
# Extract and install ngrok binary
# Then authenticate with your token
ngrok config add-authtoken YOUR_AUTH_TOKEN
```

### Running Services with Ngrok

#### 1. Start all services locally
```bash
# Terminal 1: Start FileEngine C++ backend (if running locally)
# Ensure FileEngine is running on port 8080

# Terminal 2: Start ExpressJS backend
cd express-backend
npm run dev

# Terminal 3: Start Vue3 frontend
npm run dev
```

#### 2. Create Ngrok tunnels
```bash
# In separate terminals, create tunnels for each service:

# For FileEngine backend (if running locally)
ngrok http 8080

# For ExpressJS backend
ngrok http 8081

# For Vue3 frontend
ngrok http 3000
```

Ngrok will provide you with public URLs like:
- FileEngine: `https://xxxx-xx-xxx-xxx-xxx.ngrok-free.app`
- ExpressJS: `https://yyyy-yy-yyy-yyy-yyy.ngrok-free.app`
- Frontend: `https://zzzz-zz-zzz-zzz-zzz.ngrok-free.app`

### Configuring for Testing

#### Update Environment Variables
Update your `.env` files with the Ngrok URLs:

**Frontend .env:**
```bash
VUE_APP_FILEENGINE_API_URL=https://yyyy-yy-yyy-yyy-yyy.ngrok-free.app
VUE_APP_FRONTEND_URL=https://zzzz-zz-zzz-zzz-zzz.ngrok-free.app
```

**Backend .env:**
```bash
FILEENGINE_API_URL=https://xxxx-xx-xxx-xxx-xxx.ngrok-free.app
FRONTEND_URL=https://zzzz-zz-zzz-zzz-zzz.ngrok-free.app
```

#### Configure OAuth for Testing
When using Ngrok for OAuth testing:

1. Update OAuth callback URLs in your OAuth provider settings to use the Ngrok frontend URL:
   - Development: `https://zzzz-zz-zzz-zzz-zzz.ngrok-free.app/oauth/callback`

2. Ensure the JWT configuration in the FileEngine backend is updated to accept tokens issued for the new domain.

### JWT Configuration for Testing Domains

#### Registering Testing Domain with FileEngine Backend

The FileEngine system validates JWT tokens against registered origins. To add your Ngrok domain to the backend:

1. **Access the FileEngine Admin Tool** (if available):
```bash
# If using the admin tool directly
python admin_tool.py --register-origin "ngrok-test" "YOUR_PUBLIC_KEY"
```

2. **If adding via API** (using the FileEngine HTTP proxy):
```bash
curl -X POST https://xxxx-xx-xxx-xxx-xxx.ngrok-free.app/api/v1/admin/origins/register \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "ngrok-test",
    "public_key": "YOUR_PUBLIC_KEY",
    "domain": "zzzz-zz-zzz-zzz-zzz.ngrok-free.app"
  }'
```

3. **Key Generation for Testing** (if you need to generate new keys):
```bash
# Generate a new key pair for testing
openssl genrsa -out test_jwt_private.pem 2048
openssl rsa -in test_jwt_private.pem -pubout -out test_jwt_public.pem
```

4. **Update the JWT Secret** in your backend `.env`:
```bash
JWT_SECRET="your-test-jwt-secret-key"
```

5. **Configure the public key** in the FileEngine backend system:
   - Add the public key to the origins table in the FileEngine database
   - Or use the admin tool to register the new origin with its public key
   - The FileEngine backend must have the public key to validate JWT signatures

#### JWT Token Structure Requirements
When testing with different domains, ensure JWT tokens contain the correct domain information:

```json
{
  "sub": "user@example.com",
  "iss": "https://zzzz-zz-zzz-zzz-zzz.ngrok-free.app",
  "aud": ["https://xxxx-xx-xxx-xxx-xxx.ngrok-free.app", "https://yyyy-yy-yyy-yyy-yyy.ngrok-free.app"],
  "exp": 1234567890,
  "iat": 1234561234,
  "roles": ["user", "editor"],
  "permissions": ["file.read", "file.write", "file.delete"]
}
```

### Example Complete Ngrok Setup

Here's a complete example of how to set up all services with Ngrok:

```bash
# Terminal 1: Start FileEngine backend
# (Assuming it's running on localhost:8080)

# Terminal 2: Start ExpressJS backend
cd express-backend
npm run dev

# Terminal 3: Start Vue3 frontend
npm run dev

# Terminal 4: Create Ngrok tunnel for FileEngine (if local)
ngrok http 8080

# Terminal 5: Create Ngrok tunnel for ExpressJS backend
ngrok http 8081

# Terminal 6: Create Ngrok tunnel for Vue3 frontend
ngrok http 3000

# Terminal 7: Update environment files and restart services with new URLs
# Update .env files with Ngrok URLs and restart services
```

### Testing Authentication Flow with Ngrok
1. The OAuth2 redirect will go to your Ngrok frontend URL
2. The callback will be received at the Ngrok frontend URL
3. JWT tokens will be validated against the registered origin
4. All API calls will be properly authenticated and authorized

**Important**: Remember that Ngrok URLs change each time you restart the tunnel, so you'll need to update your configurations and registered origins each time.

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
- Ngrok connectivity: Check that all services are accessible via Ngrok URLs
- JWT validation: Ensure public keys are properly registered with FileEngine
- Domain mismatch: Verify that JWT tokens contain correct domain information

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