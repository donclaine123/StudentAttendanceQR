// API configuration
const isLocalDevelopment =
  window.location.protocol === 'file:' ||
  ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);

const API_URL = isLocalDevelopment ? 'http://localhost:5000' : '/api';

// Make API_URL available globally instead of using export
window.API_URL = API_URL;

// Log the API URL for debugging
console.log("API URL configured as:", API_URL);

// Default fetch options to apply credentials
const defaultFetchOptions = {
  credentials: "include", // Always include credentials
  headers: {
    "Content-Type": "application/json",
    "Accept": "application/json"
  }
};

// Verify that the backend server is running
(async function() {
  try {
    const healthResponse = await fetch(`${API_URL}/health`, {
      credentials: "include"
    });
    
    if (healthResponse.ok) {
      const data = await healthResponse.json();
      console.log("✅ Backend server is running and reachable");
      console.log("Health check session ID:", data.sessionID);
      console.log("Cookies:", document.cookie);
    } else {
      console.warn("⚠️ Backend server responded but health check failed");
      console.warn("Status:", healthResponse.status);
    }
  } catch (error) {
    console.error("❌ Backend server is not reachable:", error.message);
    console.error("Please make sure the backend server is running at:", API_URL);
    
    // Show a user-friendly error message
    if (document.body) {
      const errorDiv = document.createElement('div');
      // --- Floating Alert Styling ---
      errorDiv.style.position = 'fixed';
      errorDiv.style.top = '20px';
      errorDiv.style.left = '20px';
      errorDiv.style.zIndex = '1100'; // Ensure it's on top (Increased from 1000)
      // --- Existing Styles (slightly adjusted padding) ---
      errorDiv.style.backgroundColor = '#ffdddd';
      errorDiv.style.padding = '15px 30px 15px 15px'; // More padding on right for button
      errorDiv.style.border = '1px solid #ff0000';
      errorDiv.style.borderRadius = '5px';
      errorDiv.style.boxShadow = '0 2px 10px rgba(0,0,0,0.1)'; // Optional: Add shadow
      errorDiv.style.fontFamily = 'sans-serif'; // Use a common font

      // --- Close Button ---
      const closeButton = document.createElement('button');
      closeButton.textContent = '×'; // Use multiplication sign for 'X'
      closeButton.style.position = 'absolute';
      closeButton.style.top = '5px';
      closeButton.style.right = '8px';
      closeButton.style.background = 'none';
      closeButton.style.border = 'none';
      closeButton.style.fontSize = '20px';
      closeButton.style.lineHeight = '1';
      closeButton.style.color = '#ff0000';
      closeButton.style.cursor = 'pointer';
      closeButton.style.padding = '0';

      // --- Close Button Functionality ---
      closeButton.onclick = function() {
        errorDiv.remove(); // Remove the error message div
      };

      errorDiv.innerHTML = `
        <h4 style="margin-top: 0; margin-bottom: 10px; color: #cc0000;">Connection Error</h4>
        <p style="margin: 0;">Cannot connect to the backend server.</p>
        <p style="margin: 5px 0 0 0;">Please ensure the server is running.</p>
      `; // Updated text styling slightly

      errorDiv.appendChild(closeButton); // Add the close button to the div
      document.body.prepend(errorDiv); // Add the div to the body
    }
  }
})();

// Helper function to make authenticated fetch requests
async function fetchWithAuth(url, options = {}) {
  // Combine default options with provided options
  const mergedOptions = {
    ...defaultFetchOptions,
    ...options,
    headers: {
      ...defaultFetchOptions.headers,
      ...(options.headers || {})
    }
  };
  
  try {
    // Construct the final URL correctly
    let finalUrl;
    if (url.startsWith('http') || url.startsWith('/api')) {
      // If URL is absolute or already starts with /api, use it as is
      finalUrl = url;
    } else {
      // Otherwise, prepend API_URL
      // Ensure no double slashes if url starts with /
      finalUrl = `${API_URL}${url.startsWith('/') ? url : '/' + url}`;
    }
    console.log(`[fetchWithAuth] Fetching: ${finalUrl}`);

    // First attempt using cookies
    const response = await fetch(finalUrl, mergedOptions);
    
    // If unauthorized and we have stored credentials, try with Authorization header
    if (response.status === 401 && sessionStorage.getItem('userEmail') && sessionStorage.getItem('userPassword')) {
      const email = sessionStorage.getItem('userEmail');
      const password = sessionStorage.getItem('userPassword');
      const base64Credentials = btoa(`${email}:${password}`);
      
      console.log("Retrying with Authorization header");
      
      // Retry with Authorization header
      mergedOptions.headers['Authorization'] = `Basic ${base64Credentials}`;
      return fetch(finalUrl, mergedOptions);
    }
    
    return response;
  } catch (error) {
    console.error(`Error fetching ${url}:`, error);
    throw error;
  }
}

