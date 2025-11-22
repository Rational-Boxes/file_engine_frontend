# FileEngine Frontend - OAuth2 and JWT Handling Plan

## Overview

This document outlines the comprehensive plan for implementing OAuth2 authentication with JWT token handling in the FileEngine frontend. The implementation will ensure secure user authentication and proper authorization with the FileEngine backend services.

## Authentication Flow

### 1. OAuth2 Authorization Code Flow
The frontend will implement the OAuth2 Authorization Code flow with PKCE (Proof Key for Code Exchange) for enhanced security:

1. User clicks "Login with [Provider]" button
2. User is redirected to OAuth provider with authorization request
3. User authenticates and consents to application permissions
4. OAuth provider redirects back with authorization code
5. Frontend exchanges code for JWT token via backend
6. JWT token is stored and used for API requests

### 2. JWT Token Architecture
- **Token Format**: Standard JWT with RS256 signature
- **Signing**: Application private key, validated by FileEngine using public key
- **Content**: User identity, roles, permissions, expiration
- **Storage**: Secure storage with refresh mechanism

## OAuth2 Implementation

### OAuth2 Service Component

```javascript
// services/authService.js (Enhanced with OAuth2)
import apiClient from './api';
import { decodeToken } from '@/utils/jwt';

export const authService = {
  // OAuth2 provider configuration
  async getAvailableProviders() {
    try {
      const response = await apiClient.get('/auth/providers');
      return response.data.providers || ['google', 'github', 'ldap'];
    } catch (error) {
      // Default providers if API call fails
      return ['google', 'github', 'ldap'];
    }
  },
  
  // Initiate OAuth2 flow
  async initiateOAuth(provider) {
    // Generate PKCE code verifier and challenge
    const codeVerifier = this.generateCodeVerifier();
    const codeChallenge = await this.generateCodeChallenge(codeVerifier);
    
    // Store verifier in sessionStorage for use after redirect
    sessionStorage.setItem('oauth_code_verifier', codeVerifier);
    
    // Build OAuth2 authorization URL
    const redirectUri = `${window.location.origin}/oauth/callback`;
    const state = this.generateState();
    
    // Store state in session for validation
    sessionStorage.setItem('oauth_state', state);
    
    const authUrl = `${apiClient.defaults.baseURL}/auth/oauth/${provider}?` +
      `client_id=${process.env.VUE_APP_OAUTH_CLIENT_ID}&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}&` +
      `response_type=code&` +
      `scope=${process.env.VUE_APP_OAUTH_SCOPE}&` +
      `state=${state}&` +
      `code_challenge=${codeChallenge}&` +
      `code_challenge_method=S256`;
    
    // Redirect to OAuth provider
    window.location.href = authUrl;
  },
  
  // Handle OAuth callback
  async handleOAuthCallback(code, state) {
    // Validate state parameter
    const storedState = sessionStorage.getItem('oauth_state');
    if (!storedState || storedState !== state) {
      throw new Error('Invalid state parameter');
    }
    
    // Retrieve code verifier
    const codeVerifier = sessionStorage.getItem('oauth_code_verifier');
    if (!codeVerifier) {
      throw new Error('Code verifier not found');
    }
    
    try {
      // Exchange authorization code for JWT token
      const response = await apiClient.post('/auth/oauth/token', {
        code,
        code_verifier: codeVerifier,
        redirect_uri: `${window.location.origin}/oauth/callback`
      });
      
      // Store tokens
      const { access_token, refresh_token, expires_in } = response.data;
      
      this.storeTokens({
        accessToken: access_token,
        refreshToken: refresh_token,
        expiresAt: Date.now() + (expires_in * 1000)
      });
      
      // Clear OAuth session data
      sessionStorage.removeItem('oauth_code_verifier');
      sessionStorage.removeItem('oauth_state');
      
      return { success: true, user: decodeToken(access_token) };
    } catch (error) {
      // Clear OAuth session data on error
      sessionStorage.removeItem('oauth_code_verifier');
      sessionStorage.removeItem('oauth_state');
      throw error;
    }
  },
  
  // Local authentication (if needed)
  async login(credentials) {
    try {
      const response = await apiClient.post('/auth/login', credentials);
      const { access_token, refresh_token, expires_in } = response.data;
      
      this.storeTokens({
        accessToken: access_token,
        refreshToken: refresh_token,
        expiresAt: Date.now() + (expires_in * 1000)
      });
      
      return { success: true, user: decodeToken(access_token) };
    } catch (error) {
      throw error;
    }
  },
  
  // Generate PKCE code verifier (128 characters)
  generateCodeVerifier() {
    const array = new Uint8Array(64);
    crypto.getRandomValues(array);
    return this.base64URLEncode(array);
  },
  
  // Generate PKCE code challenge
  async generateCodeChallenge(codeVerifier) {
    const encoder = new TextEncoder();
    const data = encoder.encode(codeVerifier);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return this.base64URLEncode(new Uint8Array(digest));
  },
  
  // Base64 URL encoding
  base64URLEncode(buffer) {
    return btoa(String.fromCharCode(...buffer))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  },
  
  // Generate state parameter for CSRF protection
  generateState() {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return this.base64URLEncode(array);
  }
};
```

### JWT Token Management

```javascript
// utils/jwt.js
export const decodeToken = (token) => {
  try {
    const [header, payload, signature] = token.split('.');
    const decodedPayload = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(decodedPayload);
  } catch (error) {
    console.error('Error decoding token:', error);
    return null;
  }
};

export const isTokenExpired = (token) => {
  const decoded = decodeToken(token);
  if (!decoded || !decoded.exp) {
    return true;
  }
  return Date.now() >= decoded.exp * 1000;
};

export const getTokenExpiration = (token) => {
  const decoded = decodeToken(token);
  if (!decoded || !decoded.exp) {
    return null;
  }
  return new Date(decoded.exp * 1000);
};

export const getTimeUntilExpiration = (token) => {
  const expiration = getTokenExpiration(token);
  if (!expiration) return 0;
  return expiration.getTime() - Date.now();
};

export const shouldRefreshToken = (token, bufferSeconds = 300) => {
  const timeUntilExpiration = getTimeUntilExpiration(token);
  return timeUntilExpiration < bufferSeconds * 1000;
};
```

### Token Storage and Security

```javascript
// utils/tokenStorage.js
class SecureTokenStorage {
  constructor() {
    this.storageKey = 'fileengine_auth';
  }
  
  // Store tokens securely
  storeTokens(tokens) {
    const tokenData = {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresAt
    };
    
    // Store in both localStorage and memory for redundancy
    localStorage.setItem(this.storageKey, JSON.stringify(tokenData));
    
    // Also store in memory for faster access
    this.currentTokens = tokenData;
  }
  
  // Get stored tokens
  getTokens() {
    if (this.currentTokens) {
      return this.currentTokens;
    }
    
    const stored = localStorage.getItem(this.storageKey);
    if (stored) {
      this.currentTokens = JSON.parse(stored);
      return this.currentTokens;
    }
    
    return null;
  }
  
  // Clear stored tokens
  clearTokens() {
    localStorage.removeItem(this.storageKey);
    sessionStorage.removeItem('oauth_code_verifier');
    sessionStorage.removeItem('oauth_state');
    this.currentTokens = null;
  }
  
  // Get access token
  getAccessToken() {
    const tokens = this.getTokens();
    if (!tokens) return null;
    
    // Check if token is expired
    if (Date.now() >= tokens.expiresAt) {
      return null;
    }
    
    return tokens.accessToken;
  }
  
  // Get refresh token
  getRefreshToken() {
    const tokens = this.getTokens();
    return tokens ? tokens.refreshToken : null;
  }
  
  // Check if user is authenticated
  isAuthenticated() {
    return !!this.getAccessToken();
  }
}

export const tokenStorage = new SecureTokenStorage();
```

## Pinia Authentication Store

```javascript
// stores/auth.js
import { defineStore } from 'pinia';
import { authService } from '@/services/authService';
import { tokenStorage } from '@/utils/tokenStorage';
import { decodeToken, isTokenExpired, shouldRefreshToken } from '@/utils/jwt';

export const useAuthStore = defineStore('auth', {
  state: () => ({
    user: null,
    isAuthenticated: false,
    accessLevel: 'user', // user, admin, editor
    loading: false,
    error: null,
    // Token refresh timer
    refreshTimer: null
  }),
  
  getters: {
    hasAccessLevel: (state) => (level) => {
      const accessLevels = {
        'user': 1,
        'editor': 2,
        'admin': 3
      };
      
      const userLevel = accessLevels[state.accessLevel] || 1;
      const requiredLevel = accessLevels[level] || 1;
      
      return userLevel >= requiredLevel;
    },
    
    userRoles: (state) => {
      return state.user?.roles || [];
    }
  },
  
  actions: {
    // Initialize auth state from stored tokens
    async initializeAuth() {
      const accessToken = tokenStorage.getAccessToken();
      if (accessToken && !isTokenExpired(accessToken)) {
        this.user = decodeToken(accessToken);
        this.isAuthenticated = true;
        this.accessLevel = this.determineAccessLevel(this.user);
        
        // Set up automatic token refresh
        this.setupTokenRefresh(accessToken);
      }
    },
    
    // Login with credentials or OAuth
    async login(credentials, isOAuth = false) {
      this.loading = true;
      this.error = null;
      
      try {
        let result;
        if (isOAuth) {
          result = await authService.handleOAuthCallback(credentials.code, credentials.state);
        } else {
          result = await authService.login(credentials);
        }
        
        if (result.success) {
          this.user = result.user;
          this.isAuthenticated = true;
          this.accessLevel = this.determineAccessLevel(this.user);
          
          // Set up automatic token refresh
          const accessToken = tokenStorage.getAccessToken();
          if (accessToken) {
            this.setupTokenRefresh(accessToken);
          }
          
          return { success: true };
        } else {
          throw new Error('Authentication failed');
        }
      } catch (error) {
        this.error = error.message || 'Login failed';
        return { success: false, error: this.error };
      } finally {
        this.loading = false;
      }
    },
    
    // Logout
    async logout() {
      tokenStorage.clearTokens();
      
      // Clear refresh timer
      if (this.refreshTimer) {
        clearTimeout(this.refreshTimer);
        this.refreshTimer = null;
      }
      
      this.user = null;
      this.isAuthenticated = false;
      this.accessLevel = 'user';
    },
    
    // Handle OAuth callback
    async handleOAuthCallback(code, state) {
      return await this.login({ code, state }, true);
    },
    
    // Determine access level from user data
    determineAccessLevel(user) {
      if (!user) return 'user';
      
      // Check user roles to determine access level
      if (user.roles?.includes('admin')) return 'admin';
      if (user.roles?.includes('editor')) return 'editor';
      return 'user';
    },
    
    // Set access level (for users with multiple roles)
    setAccessLevel(level) {
      if (this.user && this.user.roles?.includes(level)) {
        this.accessLevel = level;
      }
    },
    
    // Setup automatic token refresh
    setupTokenRefresh(accessToken) {
      if (this.refreshTimer) {
        clearTimeout(this.refreshTimer);
      }
      
      // Check token expiration 5 minutes before it actually expires
      const timeUntilRefresh = shouldRefreshToken(accessToken, 300) 
        ? 60000 // Refresh in 1 minute if already close to expiration
        : getTimeUntilExpiration(accessToken) - 300000; // 5 minutes before expiration
      
      if (timeUntilRefresh > 0) {
        this.refreshTimer = setTimeout(() => {
          this.refreshToken();
        }, timeUntilRefresh);
      } else {
        // Token already expired or will expire soon, refresh immediately
        this.refreshToken();
      }
    },
    
    // Refresh token
    async refreshToken() {
      const refreshToken = tokenStorage.getRefreshToken();
      if (!refreshToken) {
        // No refresh token available, user needs to re-authenticate
        await this.logout();
        return;
      }
      
      try {
        const response = await apiClient.post('/auth/refresh', {
          refresh_token: refreshToken
        });
        
        const { access_token, refresh_token: newRefreshToken, expires_in } = response.data;
        
        tokenStorage.storeTokens({
          accessToken: access_token,
          refreshToken: newRefreshToken,
          expiresAt: Date.now() + (expires_in * 1000)
        });
        
        this.user = decodeToken(access_token);
        this.accessLevel = this.determineAccessLevel(this.user);
        
        // Set up new refresh timer
        this.setupTokenRefresh(access_token);
      } catch (error) {
        console.error('Token refresh failed:', error);
        await this.logout();
      }
    }
  }
});
```

## API Interceptor for JWT

```javascript
// services/api.js (Updated with JWT handling)
import axios from 'axios';
import { tokenStorage } from '@/utils/tokenStorage';
import router from '@/router';
import { useAuthStore } from '@/stores/auth';

const API_BASE_URL = process.env.VUE_APP_FILEENGINE_API_URL || 'http://localhost:8080';

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 60000,
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  }
});

// Request interceptor to add JWT token
apiClient.interceptors.request.use(
  (config) => {
    const token = tokenStorage.getAccessToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor to handle common errors
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const authStore = useAuthStore();
    
    if (error.response?.status === 401) {
      // Token expired or invalid - try to refresh
      if (error.response.config._retry) {
        // Already retried, redirect to login
        await authStore.logout();
        router.push('/login');
        return Promise.reject(error);
      }
      
      // Mark as retrying to prevent infinite loops
      error.response.config._retry = true;
      
      try {
        await authStore.refreshToken();
        // Retry original request with new token
        return apiClient.request(error.response.config);
      } catch (refreshError) {
        // Refresh failed, logout user
        await authStore.logout();
        router.push('/login');
      }
    }
    
    return Promise.reject(error);
  }
);

export default apiClient;
```

## OAuth2 Callback Component

```vue
<!-- components/auth/OAuth2Callback.vue -->
<template>
  <div class="oauth-callback">
    <div class="callback-content">
      <LoadingSpinner v-if="loading" />
      <div v-else-if="error" class="error-message">
        <h3>Login Failed</h3>
        <p>{{ error }}</p>
        <button @click="goToLogin" class="btn-primary">Try Again</button>
      </div>
      <div v-else class="success-message">
        <h3>Authentication Successful</h3>
        <p>You are being redirected to the application...</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import LoadingSpinner from '../common/LoadingSpinner.vue';

const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();

const loading = ref(true);
const error = ref(null);

onMounted(async () => {
  const { code, state, error: oauthError } = route.query;
  
  if (oauthError) {
    error.value = `OAuth error: ${oauthError}`;
    loading.value = false;
    return;
  }
  
  if (!code || !state) {
    error.value = 'Invalid OAuth callback - missing required parameters';
    loading.value = false;
    return;
  }
  
  try {
    const result = await authStore.handleOAuthCallback(code, state);
    
    if (result.success) {
      // Redirect to dashboard or intended destination
      const intended = route.query.returnTo || '/';
      router.push(intended);
    } else {
      error.value = result.error;
    }
  } catch (err) {
    error.value = err.message || 'Authentication failed';
  } finally {
    loading.value = false;
  }
});

const goToLogin = () => {
  router.push('/login');
};
</script>
```

## OAuth2 Provider Buttons Component

```vue
<!-- components/auth/OAuth2Buttons.vue -->
<template>
  <div class="oauth-providers">
    <button 
      v-for="provider in providers" 
      :key="provider"
      class="oauth-btn"
      :class="`oauth-btn--${provider}`"
      @click="initiateOAuth(provider)"
    >
      <i :class="`oauth-icon oauth-icon--${provider}`"></i>
      Continue with {{ formatProviderName(provider) }}
    </button>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import { useAuthStore } from '@/stores/auth';

const emit = defineEmits(['oauth']);
const props = defineProps({
  providers: {
    type: Array,
    default: () => []
  }
});

const authStore = useAuthStore();
const availableProviders = ref([]);

onMounted(async () => {
  if (props.providers.length === 0) {
    availableProviders.value = await authStore.getAvailableProviders();
  } else {
    availableProviders.value = props.providers;
  }
});

const initiateOAuth = async (provider) => {
  await authStore.logout(); // Clear any existing auth
  await authStore.initiateOAuth(provider);
};

const formatProviderName = (provider) => {
  return provider.charAt(0).toUpperCase() + provider.slice(1);
};
</script>

<style scoped>
.oauth-providers {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
}

.oauth-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 12px 16px;
  border: 1px solid #ddd;
  border-radius: 4px;
  background: white;
  cursor: pointer;
  font-size: 16px;
  transition: all 0.2s;
}

.oauth-btn:hover {
  background: #f5f5f5;
  transform: translateY(-1px);
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.oauth-btn--google {
  border-color: #4285f4;
  color: #4285f4;
}

.oauth-btn--github {
  border-color: #333;
  color: #333;
}

.oauth-icon {
  width: 20px;
  height: 20px;
}
</style>
```

## Security Considerations

### 1. PKCE Implementation
- Code verifier generated with 128+ characters of entropy
- SHA-256 hashing for code challenge
- Code verifier stored in sessionStorage (not accessible to XSS)

### 2. Token Storage
- Access tokens stored in localStorage with HttpOnly cookies as future enhancement
- Automatic cleanup of OAuth session data
- Secure token refresh mechanism

### 3. State Parameter Validation
- Cryptographically random state parameter
- Validation against stored state value
- Prevention of CSRF attacks

### 4. Timing Attacks Prevention
- Consistent response times for validation failures
- Same error messages for different failure types

## Error Handling

### OAuth2 Error Handling
- Invalid grant errors
- Authorization server errors
- Network connection failures
- Token refresh failures

### JWT Error Handling
- Expired token errors
- Invalid signature errors
- Malformed token errors
- Clock skew issues

## Testing Strategy

### Unit Tests
- Token decoding and validation
- PKCE code generation
- Token refresh logic
- OAuth2 flow simulation

### Integration Tests
- Complete OAuth2 flow with mock provider
- JWT token validation with backend
- Token refresh scenarios
- Error condition handling

This comprehensive OAuth2 and JWT handling plan ensures secure authentication with proper token management, automatic refresh, and robust error handling for the FileEngine frontend application.