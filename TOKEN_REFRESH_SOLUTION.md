# 🔧 401 Invalid Token Error - Complete Solution

## **Problem Identified:**
The debug console shows a 401 "Invalid token" error when accessing `/users/cliq@gmail.com`. This indicates the JWT access token has expired.

## **Root Cause:**
- JWT access tokens expire after 7 days
- Frontend is not automatically refreshing expired tokens
- No fallback mechanism for token refresh

## **Complete Solution:**

### **1. Frontend Token Management (ApiService.ts)**

```typescript
// Add to ApiService.ts
class ApiService {
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private isRefreshing = false;
  private failedQueue: Array<{
    resolve: (value: any) => void;
    reject: (error: any) => void;
  }> = [];

  // Store tokens after login
  setTokens(accessToken: string, refreshToken: string) {
    this.accessToken = accessToken;
    this.refreshToken = refreshToken;
    // Store in secure storage
    SecureStore.setItemAsync('accessToken', accessToken);
    SecureStore.setItemAsync('refreshToken', refreshToken);
  }

  // Load tokens on app start
  async loadTokens() {
    this.accessToken = await SecureStore.getItemAsync('accessToken');
    this.refreshToken = await SecureStore.getItemAsync('refreshToken');
  }

  // Automatic token refresh
  private async refreshAccessToken(): Promise<string> {
    if (!this.refreshToken) {
      throw new Error('No refresh token available');
    }

    try {
      const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refreshToken: this.refreshToken }),
      });

      if (!response.ok) {
        throw new Error('Token refresh failed');
      }

      const data = await response.json();
      this.accessToken = data.accessToken;
      this.refreshToken = data.refreshToken;
      
      // Update stored tokens
      await SecureStore.setItemAsync('accessToken', data.accessToken);
      await SecureStore.setItemAsync('refreshToken', data.refreshToken);
      
      return data.accessToken;
    } catch (error) {
      // Clear tokens and redirect to login
      await this.clearTokens();
      throw error;
    }
  }

  // Enhanced makeRequest with automatic token refresh
  async makeRequest(endpoint: string, options: RequestInit = {}): Promise<Response> {
    if (!this.accessToken) {
      throw new Error('No access token available');
    }

    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.accessToken}`,
      ...options.headers,
    };

    try {
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        ...options,
        headers,
      });

      // If token is expired, try to refresh
      if (response.status === 401) {
        const errorData = await response.json();
        
        if (errorData.code === 'INVALID_TOKEN' || errorData.code === 'TOKEN_EXPIRED') {
          if (!this.isRefreshing) {
            this.isRefreshing = true;
            
            try {
              const newToken = await this.refreshAccessToken();
              this.isRefreshing = false;
              
              // Retry the original request with new token
              const retryResponse = await fetch(`${API_BASE_URL}${endpoint}`, {
                ...options,
                headers: {
                  ...headers,
                  'Authorization': `Bearer ${newToken}`,
                },
              });
              
              return retryResponse;
            } catch (refreshError) {
              this.isRefreshing = false;
              // Redirect to login
              throw refreshError;
            }
          } else {
            // Wait for refresh to complete
            return new Promise((resolve, reject) => {
              this.failedQueue.push({ resolve, reject });
            });
          }
        }
      }

      return response;
    } catch (error) {
      console.error(`🚨 API REQUEST FAILED: ${endpoint}`, error);
      throw error;
    }
  }

  // Clear tokens on logout
  async clearTokens() {
    this.accessToken = null;
    this.refreshToken = null;
    await SecureStore.deleteItemAsync('accessToken');
    await SecureStore.deleteItemAsync('refreshToken');
  }
}
```

### **2. Backend Token Refresh Endpoint (Already Implemented)**

The backend already has a working token refresh endpoint at `/auth/refresh`:

```javascript
// POST /auth/refresh
router.post('/refresh', [
  body('refreshToken')
    .notEmpty()
    .withMessage('Refresh token is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        message: 'Invalid input data',
        details: errors.array(),
        code: 'VALIDATION_ERROR'
      });
    }

    const { refreshToken } = req.body;

    // Verify refresh token
    const userId = await verifyRefreshToken(refreshToken);

    // Generate new tokens
    const { accessToken, refreshToken: newRefreshToken } = generateTokens(userId);

    // Revoke old refresh token and save new one
    await revokeRefreshToken(refreshToken);
    await saveRefreshToken(userId, newRefreshToken);

    res.json({
      success: true,
      accessToken,
      refreshToken: newRefreshToken
    });

  } catch (error) {
    console.error('Token refresh error:', error);
    res.status(401).json({
      error: 'Token refresh failed',
      message: 'Invalid or expired refresh token',
      code: 'REFRESH_ERROR'
    });
  }
});
```

### **3. Database Schema (Already Implemented)**

The `user_sessions` table exists for storing refresh tokens:

```sql
CREATE TABLE IF NOT EXISTS user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  refresh_token TEXT NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(refresh_token)
);
```

### **4. Immediate Fix for Current Issue**

To fix the current 401 error, the user needs to:

1. **Log out and log back in** to get fresh tokens
2. **Or implement the automatic token refresh** in the frontend

### **5. Testing the Token Refresh**

```bash
# Test token refresh endpoint
curl -X POST "https://web-production-e4d3d.up.railway.app/auth/refresh" \
  -H "Content-Type: application/json" \
  -d '{"refreshToken":"YOUR_REFRESH_TOKEN"}'
```

## **Implementation Priority:**

1. **HIGH:** Implement automatic token refresh in frontend
2. **MEDIUM:** Add token expiration warnings to UI
3. **LOW:** Implement silent background token refresh

## **Expected Result:**

After implementing this solution:
- ✅ No more 401 "Invalid token" errors
- ✅ Automatic token refresh when tokens expire
- ✅ Seamless user experience without manual re-login
- ✅ Secure token management with refresh tokens

The backend is already prepared for this solution - only frontend implementation is needed.
