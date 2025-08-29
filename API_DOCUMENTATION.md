# 📚 COMPLETE API DOCUMENTATION - FRONTEND TEAM

## **🌐 Base URL**
```
https://web-production-e4d3d.up.railway.app
```

## **🔐 Authentication**
All protected endpoints require a JWT token in the Authorization header:
```javascript
const headers = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${accessToken}`
};
```

---

## **✅ WORKING APIs (READY FOR IMPLEMENTATION)**

### **1. Health Check**
```http
GET /health
```
**Response:**
```json
{
  "status": "OK",
  "timestamp": "2025-08-29T15:05:11.068Z",
  "uptime": 205.844987018,
  "environment": "production"
}
```

### **2. User Creation**
```http
POST /api/v1/users
Content-Type: application/json

{
  "username": "testuser",
  "email": "test@example.com",
  "firstName": "Test",
  "lastName": "User"
}
```
**Response:**
```json
{
  "success": true,
  "user": {
    "id": "227a7003-cc88-411a-92d8-96af67acdc33",
    "username": "testuser",
    "email": "test@example.com",
    "firstName": "Test",
    "lastName": "User",
    "isOnline": true,
    "lastSeen": "2025-08-29T14:46:28.169Z"
  }
}
```

### **3. Firebase Authentication**
```http
POST /api/v1/auth/firebase-login
Content-Type: application/json

{
  "firebaseIdToken": "your-firebase-token",
  "userData": {
    "uid": "firebase-uid",
    "email": "user@example.com",
    "displayName": "User Name"
  }
}
```
**Response:**
```json
{
  "success": true,
  "message": "Firebase login successful",
  "user": {
    "id": "80a444b3-f7d2-40a0-b37f-85c7b4758546",
    "username": "Firebase User",
    "email": "firebase@test.com",
    "first_name": "Firebase",
    "last_name": "User",
    "bio": null,
    "profile_picture": null,
    "created_at": "2025-08-29T14:24:34.814Z"
  },
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": 604800
}
```

### **4. Get All Users**
```http
GET /api/v1/users
```
**Response:**
```json
{
  "success": true,
  "users": [
    {
      "id": "80a444b3-f7d2-40a0-b37f-85c7b4758546",
      "username": "Firebase User",
      "email": "firebase@test.com",
      "firstName": "Firebase",
      "lastName": "User",
      "phoneNumber": null,
      "profilePicture": null,
      "isOnline": true,
      "lastSeen": "2025-08-29T14:24:34.814Z",
      "createdAt": "2025-08-29T14:24:34.814Z"
    }
  ]
}
```

### **5. User Lookup (UUID)**
```http
GET /api/v1/users/{userId}
Authorization: Bearer {jwt-token}
```
**Response:**
```json
{
  "id": "80a444b3-f7d2-40a0-b37f-85c7b4758546",
  "username": "Firebase User",
  "first_name": "Firebase",
  "last_name": "User",
  "bio": null,
  "profile_picture": null,
  "is_online": true,
  "last_seen": "2025-08-29T14:24:34.814Z",
  "created_at": "2025-08-29T14:24:34.814Z"
}
```

### **6. User Lookup (Email/Username Fallback)**
```http
GET /api/v1/users/{email-or-username}
Authorization: Bearer {jwt-token}
```
**Response:** Same as UUID lookup - automatically handles fallback

### **7. Location Update**
```http
POST /api/v1/nearby/location
Authorization: Bearer {jwt-token}
Content-Type: application/json

{
  "latitude": 40.7128,
  "longitude": -74.0060,
  "accuracy": 10.5
}
```
**Response:**
```json
{
  "message": "Location updated successfully",
  "location": {
    "latitude": 40.7128,
    "longitude": -74.0060,
    "accuracy": 10.5
  }
}
```

### **8. Nearby Users**
```http
GET /api/v1/nearby/nearby?radius=10
Authorization: Bearer {jwt-token}
```
**Response:**
```json
{
  "success": true,
  "users": [
    {
      "id": "30f7bdc3-8900-4536-b696-cf94f9474bf3",
      "username": "Test User",
      "first_name": "Test",
      "last_name": "User",
      "profile_picture": null,
      "latitude": "40.71280000",
      "longitude": "-74.00600000",
      "last_updated": "2025-08-29T15:01:45.032Z",
      "distance": 0
    }
  ],
  "userLocation": {
    "latitude": "40.71280000",
    "longitude": "-74.00600000"
  },
  "radius": 10
}
```

### **9. Groups**
```http
GET /api/v1/groups
Authorization: Bearer {jwt-token}
```
**Response:**
```json
{
  "success": true,
  "groups": []
}
```

### **10. Chats**
```http
GET /api/v1/chats
Authorization: Bearer {jwt-token}
```
**Response:**
```json
{
  "success": true,
  "chats": []
}
```

### **11. Messages**
```http
GET /api/v1/messages/{chatId}
Authorization: Bearer {jwt-token}
```
**Response:**
```json
{
  "success": true,
  "messages": [],
  "pagination": {
    "total": 0,
    "limit": 50,
    "offset": 0,
    "hasMore": false
  }
}
```

### **12. File Upload**
```http
POST /api/v1/files/upload
Authorization: Bearer {jwt-token}
Content-Type: multipart/form-data

file: [binary file data]
```
**Response:**
```json
{
  "message": "File uploaded successfully",
  "url": "https://web-production-e4d3d.up.railway.app/uploads/uuid-filename.jpg",
  "filename": "uuid-filename.jpg",
  "size": 12345,
  "mimetype": "image/jpeg"
}
```

---

## **🔌 WebSocket Events (Real-time Messaging)**

### **Connection**
```javascript
const socket = io('https://web-production-e4d3d.up.railway.app', {
  auth: {
    token: 'your-jwt-token'
  }
});
```

### **Events**

#### **Join Chat Room**
```javascript
socket.emit('join_chat', { chatId: 'chat-uuid' });
```

#### **Send Message**
```javascript
socket.emit('send_message', {
  chatId: 'chat-uuid',
  content: 'Hello world!',
  type: 'text'
});
```

#### **Typing Indicators**
```javascript
// Start typing
socket.emit('typing_start', { chatId: 'chat-uuid' });

// Stop typing
socket.emit('typing_stop', { chatId: 'chat-uuid' });
```

#### **Message Read**
```javascript
socket.emit('message_read', {
  messageId: 'message-uuid',
  chatId: 'chat-uuid'
});
```

#### **Listen for Events**
```javascript
// New message received
socket.on('new_message', (data) => {
  console.log('New message:', data);
});

// User typing
socket.on('typing_started', (data) => {
  console.log('User typing:', data);
});

// Message read
socket.on('message_read', (data) => {
  console.log('Message read:', data);
});

// User online/offline
socket.on('user_status_changed', (data) => {
  console.log('User status:', data);
});
```

---

## **🚀 Frontend Implementation Guide**

### **1. Authentication Flow**
```javascript
// 1. Firebase Authentication
const userCredential = await signInWithEmailAndPassword(auth, email, password);
const idToken = await userCredential.user.getIdToken();

// 2. Backend Authentication
const response = await fetch('https://web-production-e4d3d.up.railway.app/api/v1/auth/firebase-login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    firebaseIdToken: idToken,
    userData: {
      uid: userCredential.user.uid,
      email: userCredential.user.email,
      displayName: userCredential.user.displayName
    }
  })
});

const { accessToken, refreshToken } = await response.json();

// 3. Store tokens
localStorage.setItem('accessToken', accessToken);
localStorage.setItem('refreshToken', refreshToken);
```

### **2. API Client Setup**
```javascript
const API_BASE = 'https://web-production-e4d3d.up.railway.app';

const apiClient = {
  async request(endpoint, options = {}) {
    const token = localStorage.getItem('accessToken');
    const headers = {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
      ...options.headers
    };

    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers
    });

    if (!response.ok) {
      throw new Error(`API Error: ${response.status}`);
    }

    return response.json();
  },

  // User APIs
  getUsers: () => this.request('/api/v1/users'),
  createUser: (userData) => this.request('/api/v1/users', {
    method: 'POST',
    body: JSON.stringify(userData)
  }),
  getUser: (userId) => this.request(`/api/v1/users/${userId}`),

  // Location APIs
  updateLocation: (location) => this.request('/api/v1/nearby/location', {
    method: 'POST',
    body: JSON.stringify(location)
  }),
  getNearbyUsers: (radius = 10) => this.request(`/api/v1/nearby/nearby?radius=${radius}`),

  // Chat APIs
  getChats: () => this.request('/api/v1/chats'),
  getMessages: (chatId) => this.request(`/api/v1/messages/${chatId}`),

  // Group APIs
  getGroups: () => this.request('/api/v1/groups'),

  // File Upload
  uploadFile: (file) => {
    const formData = new FormData();
    formData.append('file', file);
    
    return fetch(`${API_BASE}/api/v1/files/upload`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${localStorage.getItem('accessToken')}`
      },
      body: formData
    }).then(res => res.json());
  }
};
```

### **3. WebSocket Setup**
```javascript
import { io } from 'socket.io-client';

const socket = io('https://web-production-e4d3d.up.railway.app', {
  auth: {
    token: localStorage.getItem('accessToken')
  }
});

socket.on('connect', () => {
  console.log('Connected to WebSocket');
});

socket.on('disconnect', () => {
  console.log('Disconnected from WebSocket');
});

export default socket;
```

---

## **📱 React Native Implementation**

### **Installation**
```bash
npm install socket.io-client
npm install @react-native-async-storage/async-storage
```

### **API Service**
```javascript
// services/api.js
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_BASE = 'https://web-production-e4d3d.up.railway.app';

export const apiService = {
  async getToken() {
    return await AsyncStorage.getItem('accessToken');
  },

  async request(endpoint, options = {}) {
    const token = await this.getToken();
    const headers = {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
      ...options.headers
    };

    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers
    });

    if (!response.ok) {
      throw new Error(`API Error: ${response.status}`);
    }

    return response.json();
  },

  // API methods...
};
```

### **WebSocket Hook**
```javascript
// hooks/useWebSocket.js
import { useEffect, useRef } from 'react';
import io from 'socket.io-client';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const useWebSocket = () => {
  const socketRef = useRef(null);

  useEffect(() => {
    const connectSocket = async () => {
      const token = await AsyncStorage.getItem('accessToken');
      
      socketRef.current = io('https://web-production-e4d3d.up.railway.app', {
        auth: { token }
      });

      socketRef.current.on('connect', () => {
        console.log('WebSocket connected');
      });
    };

    connectSocket();

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, []);

  return socketRef.current;
};
```

---

## **✅ ALL APIS ARE WORKING AND READY FOR FRONTEND IMPLEMENTATION!**

### **Features Available:**
- ✅ User registration and authentication
- ✅ Firebase integration
- ✅ User discovery (all users + nearby users)
- ✅ Location tracking
- ✅ Chat system (ready for messages)
- ✅ Group system
- ✅ File upload
- ✅ Real-time messaging via WebSocket
- ✅ Typing indicators
- ✅ Message read receipts
- ✅ User online/offline status

### **Next Steps for Frontend:**
1. Implement Firebase authentication
2. Set up API client with JWT token management
3. Implement user registration and profile management
4. Build chat and messaging UI
5. Implement location-based user discovery
6. Add file upload functionality
7. Set up WebSocket for real-time features

**All backend APIs are fully functional and ready for production use!** 🚀
