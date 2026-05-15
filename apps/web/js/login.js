// Use global API_URL instead of import
// import { API_URL } from "./config.js";

// ==========================================
//          Global Helper Functions
// ==========================================

// Use global API_URL (defined in config.js, loaded via HTML)
// Assume API_URL is available globally

// Get base path for redirects
function getBasePath() {
  const isLocalDevelopment =
    window.location.protocol === 'file:' ||
    ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);

  return isLocalDevelopment ? '/apps/web' : '';
}

// Convert date to UTC+8 string
function convertToUTC8(date) {
  const utc8Date = new Date(date.getTime() + (8 * 60 * 60 * 1000));
  return utc8Date.toISOString().replace('Z', '+08:00');
}

// Login function
async function login(email, password) {
  try {
    console.log('Attempting login with:', email);
    const response = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ email, password }),
      credentials: 'include'
    });
    console.log('Login response status:', response.status);

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Login failed:', errorData);
      return { success: false, message: errorData.message || 'Login failed.' };
    }

    const data = await response.json();
    console.log('Login successful:', data);

    // Store essential data in sessionStorage
    
    sessionStorage.setItem('userId', data.user.id);
    sessionStorage.setItem('userRole', data.role);
    sessionStorage.setItem('loginTime', convertToUTC8(new Date()));
    // Log right after basic items
    console.log(`[login.js] After setting base items: userId=${sessionStorage.getItem('userId')}, userRole=${sessionStorage.getItem('userRole')}`);

    if (data.user.firstName && data.user.lastName) {
      sessionStorage.setItem('firstName', data.user.firstName);
      sessionStorage.setItem('lastName', data.user.lastName);
      sessionStorage.setItem('userName', `${data.user.firstName} ${data.user.lastName}`);
      // Log right after name items
      console.log(`[login.js] After setting name items: firstName=${sessionStorage.getItem('firstName')}, lastName=${sessionStorage.getItem('lastName')}`);
    } else {
      sessionStorage.removeItem('firstName');
      sessionStorage.removeItem('lastName');
      sessionStorage.removeItem('userName');
    }
    // Store studentId if available in the response (for students)
    if (data.role === 'student' && data.user.studentId) {
      sessionStorage.setItem('studentId', data.user.studentId);
      // Log right after student ID item
      console.log(`[login.js] After setting studentId: studentId=${sessionStorage.getItem('studentId')}`);
    } else {
      sessionStorage.removeItem('studentId'); // Ensure it's removed for non-students or if missing
    }

    return { success: true, message: 'Login successful!', userData: { id: data.user.id, role: data.role } };
  } catch (error) {
    console.error('Login error:', error);
    return { success: false, message: 'An error occurred during login.' };
  }
}

// Logout function
async function logout() {
  try {
    console.log('Logging out...');
    await fetch(`${API_URL}/auth/logout`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Accept': 'application/json' }
    });
  } catch (error) {
    console.error('Logout fetch error:', error);
  } finally {
    // Always clear session and redirect
    sessionStorage.clear();
    console.log('Session cleared.');
    window.location.href = getBasePath() + '/pages/login.html';
  }
}

// Redirect to appropriate dashboard
function redirectToDashboard(role) {
  const basePath = getBasePath();
  console.log(`Redirecting to ${role} dashboard...`);
  if (role === 'teacher') {
    window.location.href = `${basePath}/pages/teacher-dashboard.html`;
  } else if (role === 'student') {
    window.location.href = `${basePath}/pages/student-dashboard.html`;
  } else {
    console.warn('Unknown role, redirecting to login.');
    window.location.href = `${basePath}/pages/login.html`;
  }
}

// Check authentication status and update UI
async function checkAuthenticationAndUpdateUI() {
  // Get DOM elements needed for UI update
  const alreadyLoggedInOverlay = document.getElementById('alreadyLoggedInOverlay');
  const loginSection = document.getElementById('login-section');
  const signupPanel = document.querySelector('.signup-panel');
  const verificationSection = document.getElementById('verification-section');
  const mainContainer = document.querySelector('.container');

  let isAuthenticated = false;
  let userRole = null;
  let userName = 'User'; // Default name

  // 1. Try server authentication
  try {
    console.log('Checking authentication status via server...');
    const response = await fetch(`${API_URL}/auth/check-auth`, { credentials: 'include' });
    const data = await response.json();
    console.log('Auth check response:', data);

    if (data.authenticated && data.user) {
      isAuthenticated = true;
      userRole = data.user.role;
      // Update sessionStorage if server check is successful
      sessionStorage.setItem('userId', data.user.id);
      sessionStorage.setItem('userRole', data.user.role);
      if (data.user.firstName && data.user.lastName) {
        userName = `${data.user.firstName} ${data.user.lastName}`;
        sessionStorage.setItem('userName', userName);
        sessionStorage.setItem('firstName', data.user.firstName);
        sessionStorage.setItem('lastName', data.user.lastName);
      } else {
        userName = sessionStorage.getItem('userName') || 'User'; // Fallback
      }
      console.log('Server check: User authenticated.', { userRole, userName });
    }
  } catch (error) {
    console.warn('Server auth check failed, checking sessionStorage:', error);
  }

  // 2. If server failed, try sessionStorage
  if (!isAuthenticated) {
    const localRole = sessionStorage.getItem('userRole');
    const localUserId = sessionStorage.getItem('userId');
    const localUserName = sessionStorage.getItem('userName');

    if (localUserId && localRole) {
      isAuthenticated = true;
      userRole = localRole;
      userName = localUserName || 'User';
      console.log('SessionStorage check: User authenticated.', { userRole, userName });
    } else {
      console.log('SessionStorage check: User not authenticated.');
    }
  }

  // 3. Update UI based on authentication status
  if (isAuthenticated && userRole) {
    console.log("Showing 'Already Logged In' overlay.");
    // User is logged in - Show overlay, blur background, hide forms
    if (alreadyLoggedInOverlay && mainContainer) {
      alreadyLoggedInOverlay.style.display = 'flex';
      setTimeout(() => alreadyLoggedInOverlay.classList.add('visible'), 10);

      mainContainer.classList.add('blur-background');

      // Automatically redirect after a delay
      setTimeout(() => {
          redirectToDashboard(userRole);
      }, 2500);
    }
    // Hide the main form sections
    if (loginSection) loginSection.style.display = 'none';
    if (signupPanel) signupPanel.style.display = 'none';
    if (verificationSection) verificationSection.style.display = 'none';

  } else {
    console.log('User not authenticated, showing default login/signup form.');
    // User is not logged in - Hide overlay, remove blur
    if (alreadyLoggedInOverlay) {
        alreadyLoggedInOverlay.classList.remove('visible');
        setTimeout(() => alreadyLoggedInOverlay.style.display = 'none', 300);
    }
    if (mainContainer) mainContainer.classList.remove('blur-background');

    // Only show login form if verification section isn't supposed to be visible
    const isVerificationVisible = verificationSection && verificationSection.style.display === 'block';
    if (!isVerificationVisible) {
        if (loginSection) loginSection.style.display = 'block';
        if (signupPanel) signupPanel.style.display = 'none';
    }
    // Else: Verification is visible, leave it as is.
  }
}

// ==========================================
//          DOM Ready Event Listener
// ==========================================
document.addEventListener('DOMContentLoaded', function () {
  // --- Get ALL DOM Elements Needed --- 
  const loginForm = document.getElementById('login-form');
  const signupForm = document.getElementById('signup-form');
  const showRegisterBtn = document.getElementById('showSignup');
  const showLoginBtn = document.getElementById('showLogin');
  const loginSection = document.getElementById('login-section');
  const registerSection = document.querySelector('.signup-panel');
  const verificationSection = document.getElementById('verification-section');
  const verificationEmailElement = document.getElementById('verification-email');
  const proceedToLoginBtn = document.getElementById('proceed-to-login-btn');
  const roleSelect = document.getElementById('role');
  const studentIdField = document.getElementById('student-id-field');
  const errorMsgElement = document.getElementById('errorMsg');
  const leftPanel = document.querySelector('.left-panel');
  const rightPanel = document.querySelector('.right-panel');
  const signupPanel = document.querySelector('.signup-panel');
  const passwordInput = document.getElementById('reg-password');
  const strengthMeterFill = document.getElementById('strength-meter-fill');
  const strengthText = document.getElementById('strength-text');
  const confirmPasswordInput = document.getElementById('confirm-password');
  const passwordMatchError = document.getElementById('password-match-error');
  const emailInput = document.getElementById('reg-email'); // Specific email input for register
  const emailErrorMsg = document.getElementById('email-error-message');

  // --- Initial Check --- 
  checkAuthenticationAndUpdateUI(); // Check auth status and set initial UI state

  // --- Event Listeners --- 

  // Password Strength Indicator
  if (passwordInput && strengthMeterFill && strengthText) {
    passwordInput.addEventListener('input', () => {
      const password = passwordInput.value;
      let strength = 0;
      let feedback = '';
      if (password.length >= 8) {
        strength += 25;
        // Hide password length error if length is sufficient
        const passwordLengthError = document.getElementById('password-length-error');
        if (passwordLengthError) passwordLengthError.style.display = 'none';
        passwordInput.classList.remove('input-error');
      }
      if (/[A-Z]/.test(password)) strength += 25;
      if (/[0-9]/.test(password)) strength += 25;
      if (/[^A-Za-z0-9]/.test(password)) strength += 25;
      strengthMeterFill.style.width = `${strength}%`;
      if (strength <= 25) { strengthMeterFill.style.backgroundColor = '#ef4444'; feedback = 'Weak'; }
      else if (strength <= 50) { strengthMeterFill.style.backgroundColor = '#f59e0b'; feedback = 'Fair'; }
      else if (strength <= 75) { strengthMeterFill.style.backgroundColor = '#3b82f6'; feedback = 'Good'; }
      else { strengthMeterFill.style.backgroundColor = '#10b981'; feedback = 'Strong'; }
      strengthText.textContent = feedback;
    });
  }

  // Password Match Validation Function
  function validatePasswordMatch() {
    if (!passwordInput || !confirmPasswordInput || !passwordMatchError) return false;
    const password = passwordInput.value;
    const confirmPassword = confirmPasswordInput.value;
    if (confirmPassword === '') {
      passwordMatchError.style.display = 'none';
      passwordInput.classList.remove('input-error');
      confirmPasswordInput.classList.remove('input-error');
      return true;
    }
    if (password !== confirmPassword) {
      passwordMatchError.style.display = 'block';
      passwordInput.classList.add('input-error');
      confirmPasswordInput.classList.add('input-error');
      return false;
    } else {
      passwordMatchError.style.display = 'none';
      passwordInput.classList.remove('input-error');
      confirmPasswordInput.classList.remove('input-error');
      return true;
    }
  }
  // Add listeners for password match
  if (passwordInput) passwordInput.addEventListener('input', validatePasswordMatch);
  if (confirmPasswordInput) confirmPasswordInput.addEventListener('input', validatePasswordMatch);

  // Role Selection Toggle Functionality
  const roleToggleOptions = document.querySelectorAll('.role-toggle-option');
  if (roleToggleOptions.length && roleSelect) {
    // Set initial value based on active toggle
    const activeOption = document.querySelector('.role-toggle-option.active');
    if (activeOption) roleSelect.value = activeOption.dataset.value;
    // Add click handlers
    roleToggleOptions.forEach(option => {
      option.addEventListener('click', function () {
        roleToggleOptions.forEach(opt => opt.classList.remove('active'));
        this.classList.add('active');
        roleSelect.value = this.dataset.value;
        roleSelect.dispatchEvent(new Event('change')); // Trigger change
        // Show/hide student ID field
        const studentIdInput = document.getElementById('student-id');
        if (studentIdField && studentIdInput) {
          if (this.dataset.value === 'student') {
            studentIdField.style.display = 'block';
            studentIdInput.disabled = false;
            studentIdInput.setAttribute('required', 'required');
          } else {
            studentIdField.style.display = 'none';
            studentIdInput.disabled = true;
            studentIdInput.removeAttribute('required');
          }
        }
      });
    });
    // Ensure initial state is correct on load
    const studentIdInput = document.getElementById('student-id');
     if (studentIdField && studentIdInput) {
    if (roleSelect.value === 'student') {
          studentIdField.style.display = 'block'; studentIdInput.disabled = false; studentIdInput.setAttribute('required', 'required');
    } else {
           studentIdField.style.display = 'none'; studentIdInput.disabled = true; studentIdInput.removeAttribute('required');
        }
    }
  }

  // Show Registration Panel
  if (showRegisterBtn && rightPanel && signupPanel && leftPanel) {
    showRegisterBtn.addEventListener('click', function (e) {
      e.preventDefault();
      if (verificationSection) verificationSection.style.display = 'none';
      leftPanel.classList.add('slide-right');
      rightPanel.classList.add('hide-login');
      signupPanel.classList.add('slide-in');
      if (loginSection) loginSection.style.display = 'none';
      if (registerSection) registerSection.style.display = 'block';
    });
  }

  // Show Login Panel (from signup panel)
  if (showLoginBtn && rightPanel && signupPanel && leftPanel) {
    showLoginBtn.addEventListener('click', function (e) {
      e.preventDefault();
      if (verificationSection) verificationSection.style.display = 'none';
      leftPanel.classList.remove('slide-right');
      rightPanel.classList.remove('hide-login');
      signupPanel.classList.remove('slide-in');
      if (registerSection) registerSection.style.display = 'none';
      if (loginSection) loginSection.style.display = 'block';
    });
  }

  // Proceed to Login (from verification panel)
  if (proceedToLoginBtn && rightPanel && signupPanel && verificationSection && loginSection && registerSection && leftPanel) {
    proceedToLoginBtn.addEventListener('click', () => {
      if (verificationSection) verificationSection.style.display = 'none';
      leftPanel.classList.remove('slide-right');
      rightPanel.classList.remove('hide-login');
      signupPanel.classList.remove('slide-in');
      if (loginSection) loginSection.style.display = 'block';
      if (registerSection) registerSection.style.display = 'none';
    });
  }

  // Login Form Submission
  if (loginForm) {
    loginForm.addEventListener('submit', async function (e) {
      e.preventDefault();
      const email = document.getElementById('email').value;
      const password = document.getElementById('password').value;
      const submitButton = e.target.querySelector('button[type="submit"]');
      const originalButtonText = submitButton.textContent;
      submitButton.textContent = 'Logging in...';
      submitButton.disabled = true;
      errorMsgElement.style.display = 'none'; // Hide previous errors

      try {
        const result = await login(email, password);
        if (result.success) {
          console.log('Login successful, starting exit animation...');

          // Add class to trigger exit animation
          document.body.classList.add('page-exiting');
          document.body.classList.remove('page-loaded'); // Optional: remove loaded class

          // Wait for animation to finish before redirecting
          setTimeout(() => {
            redirectToDashboard(result.userData.role);
          }, 850); // Delay should match/exceed CSS transition duration (e.g., 0.8s wave + buffer)

        } else {
          showError(result.message, false); // Don't auto-hide login errors
          submitButton.textContent = originalButtonText;
          submitButton.disabled = false;
        }
      } catch (error) {
        console.error('Login submit error:', error);
        showError('An error occurred during login. Please try again.', false); // Don't auto-hide
        submitButton.textContent = originalButtonText;
        submitButton.disabled = false;
      }
    });
  }

  // Registration Form Submission
  if (signupForm) {
    signupForm.addEventListener('submit', async function (e) {
      e.preventDefault();
      if (!validatePasswordMatch()) return;

      const role = roleSelect.value;
      const email = emailInput.value;
      const firstName = document.getElementById('first-name').value;
      const lastName = document.getElementById('last-name').value;
      const password = passwordInput.value;
      const studentId = (role === 'student') ? document.getElementById('student-id')?.value : null;

      // Check password length
      if (password.length < 8) {
        if (passwordInput) passwordInput.classList.add('input-error');
        
        // Show dedicated password length error
        const passwordLengthError = document.getElementById('password-length-error');
        if (passwordLengthError) {
          passwordLengthError.style.display = 'block';
        } else {
          // Fallback to general error if element not found
          console.error("Password validation failed: too short (< 8 characters)");
          showError('Password must be at least 8 characters long.', false);
        }
        
        return;
      }

      const submitButton = e.target.querySelector('button[type="submit"]');
      const originalButtonText = submitButton.textContent;
      submitButton.textContent = 'Registering...';
      submitButton.disabled = true;
      errorMsgElement.style.display = 'none'; // Clear general error
      if (emailErrorMsg) emailErrorMsg.textContent = ''; // Clear specific email error
      emailInput?.classList.remove('input-error');
      passwordInput?.classList.remove('input-error'); // Remove error class from password

      try {
        const response = await fetch(`${API_URL}/auth/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify({ role, email, firstName, lastName, password, studentId }),
          credentials: 'include'
        });
        const data = await response.json();

        if (!response.ok) {
          if (response.status === 400 && data.message && data.message.toLowerCase().includes('email already registered')) {
            if (emailInput) emailInput.classList.add('input-error');
                if (emailErrorMsg) emailErrorMsg.textContent = data.message;
          } else {
                 showError(data.message || `Registration failed: ${response.status}`);
          }
          submitButton.textContent = originalButtonText;
          submitButton.disabled = false;
            return;
        }

        // SUCCESS
        signupForm.reset(); // Clear form
        // Reset visuals (strength meter, role toggle, student ID)
        if (strengthMeterFill) strengthMeterFill.style.width = '0%';
        if (strengthText) strengthText.textContent = '';
        if (passwordMatchError) passwordMatchError.style.display = 'none';
        passwordInput?.classList.remove('input-error');
        confirmPasswordInput?.classList.remove('input-error');
        if (roleSelect) roleSelect.value = 'student';
        roleToggleOptions.forEach(opt => opt.dataset.value === 'student' ? opt.classList.add('active') : opt.classList.remove('active'));
        const studentIdInput = document.getElementById('student-id');
        if (studentIdField && studentIdInput) { studentIdField.style.display = 'block'; studentIdInput.disabled = false; studentIdInput.setAttribute('required', 'required'); }

        // Show verification panel
        if (verificationEmailElement) verificationEmailElement.textContent = email;
        if (rightPanel) rightPanel.classList.add('hide-login');
        if (signupPanel) signupPanel.classList.remove('slide-in');
        if (registerSection) registerSection.style.display = 'none';
        if (loginSection) loginSection.style.display = 'none';
        if (verificationSection) {
          verificationSection.style.display = 'block';
          setTimeout(() => { if (verificationSection) verificationSection.classList.add('visible'); }, 10);
        }

        submitButton.textContent = originalButtonText;
        submitButton.disabled = false;

      } catch (error) {
        console.error('Registration submit error:', error);
        showError('Network error or could not connect to server.');
        submitButton.textContent = originalButtonText;
        submitButton.disabled = false;
      }
    });
  }

  // --- Utility Functions (Error/Success Message Display) ---
  function showError(message, autoHide = true) {
    console.error("Error message:", message); // Always log to console
    
    if (!errorMsgElement) {
      // Create a temporary error message if element doesn't exist
      console.warn("Error message element not found in DOM, creating temporary one");
      const tempError = document.createElement('div');
      tempError.className = 'error-message error-visible'; // Add error-visible class
      tempError.style.position = 'fixed';
      tempError.style.top = '20px';
      tempError.style.left = '50%';
      tempError.style.transform = 'translateX(-50%)';
      tempError.style.zIndex = '9999';
      // Add explicit display and styles to override CSS
      tempError.style.display = 'block';
      tempError.style.backgroundColor = '#f44336';
      tempError.style.color = 'white';
      tempError.style.padding = '15px 20px';
      tempError.style.borderRadius = '5px';
      tempError.style.boxShadow = '0 4px 8px rgba(0,0,0,0.2)';
      tempError.style.fontWeight = 'bold';
      tempError.textContent = message;
      
      document.body.appendChild(tempError);
      
      // Only hide if autoHide is true
      if (autoHide) {
        setTimeout(() => {
          if (document.body.contains(tempError)) {
            document.body.removeChild(tempError);
          }
        }, 5000);
      }
      return; // Exit after creating temporary message
    }
    
    // Use the existing error element with CSS styling from login.css
    errorMsgElement.textContent = message;
    errorMsgElement.style.display = 'block';
    
    // Make sure it's visible by adding important styles
    errorMsgElement.classList.add('error-visible');
    // Add inline styles to override any CSS rules
    errorMsgElement.style.backgroundColor = '#f44336';
    errorMsgElement.style.color = 'white';
    errorMsgElement.style.padding = '10px 15px';
    errorMsgElement.style.margin = '10px 0';
    errorMsgElement.style.borderRadius = '5px';
    errorMsgElement.style.fontWeight = 'bold';
    errorMsgElement.style.textAlign = 'center';
    
    // Only set timeout if autoHide is true
    if (autoHide) {
      setTimeout(() => { 
        if (errorMsgElement) {
          errorMsgElement.style.display = 'none';
          errorMsgElement.classList.remove('error-visible');
        }
      }, 5000);
  }
  }

}); // End DOMContentLoaded