// Use global API_URL instead of import
// import API_URL from "./config.js";

// Student Dashboard functionality

(function() {
    const userId = sessionStorage.getItem('userId');
    const userRole = sessionStorage.getItem('userRole');
    const expectedRole = 'student'; // Role expected for this page


    if (!userId || userRole !== expectedRole) {
        console.warn(`[Role Check - Student] Access denied. Role is ${userRole}, expected ${expectedRole}. Redirecting to login.`);
        // Clear potentially incorrect session data before redirecting
        sessionStorage.clear(); 
        // Use getBasePath if available, otherwise assume root or relative path
        const basePath = typeof getBasePath === 'function' ? getBasePath() : ''; 
        window.location.href = basePath + '/pages/login.html'; // Redirect to login page instead of index
    }
})();

// --- NEW UI INTERACTIONS ---

function setupNewUIInteractions() {
    

    // --- User Menu Dropdown ---
    const userMenuTrigger = document.getElementById('user-menu-trigger');
    const userMenuDropdown = document.getElementById('user-menu-dropdown');

    if (userMenuTrigger && userMenuDropdown) {
        userMenuTrigger.addEventListener('click', (event) => {
            event.stopPropagation(); // Prevent click from immediately closing menu
            userMenuDropdown.classList.toggle('visible');
            
        });

        // Close dropdown if clicking outside
        document.addEventListener('click', (event) => {
            if (!userMenuTrigger.contains(event.target) && !userMenuDropdown.contains(event.target)) {
                if (userMenuDropdown.classList.contains('visible')) {
                    userMenuDropdown.classList.remove('visible');
                    
                }
            }
        });
         
    } else {
        console.warn('[User Menu] Trigger or dropdown element not found.');
    }

    // --- More interaction setup will go here (Overlay Sections) ---
}

// --- END NEW UI INTERACTIONS ---

document.addEventListener('DOMContentLoaded', function() {

    // Call new setup function
    setupNewUIInteractions();

    // Initialize dashboard
    initDashboard();
    
    // Load attendance history
    loadAttendanceHistory();
    
    // --- NEW: Load student info card data directly --- 
    loadStudentInfoCardData(); 
    
    // Add event listeners
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', function(e) {
            e.preventDefault();
            logout(this);
        });
        
    } else {
        console.error('Logout button not found');
    }
    
    // Add event listener for scan QR button
    const scanQrBtn = document.getElementById('scan-qr-btn');
    
    if (scanQrBtn) {
        scanQrBtn.addEventListener('click', function() {
            document.getElementById('qr-scanner-section').style.display = 'block';
            // Update active navigation
            setActiveNav('nav-scan');
        });
    }
    
    // Listen for attendance recorded events from scanner.js
    document.addEventListener('attendance-recorded', function(event) {
        
        // Reload attendance history when scanner.js records attendance
        loadAttendanceHistory();
    });
    
    // Setup navigation event listeners
    setupNavigation();
    
    // Set up debug listeners
    setupDebugListeners();

    const qrScannerSection = document.getElementById('qr-scanner-section');
    const videoPlaceholder = qrScannerSection?.querySelector('.video-placeholder');
    const scanLine = qrScannerSection?.querySelector('.scan-line');
    const startScanButton = document.getElementById('startScanBtn'); // Button INSIDE scanner section
    let scannerControl; // Assuming scanner.js exposes controls

    // When scanner overlay is shown (Should be called from showOverlaySection or listeners)
    function onScannerShow() {
        
        if (typeof initScanner === 'function') { 
            scannerControl = initScanner(); // Get control object if scanner.js provides one
        } else {
            console.warn("initScanner function not found");
        }
        // Show placeholder initially, hide scan line
        if(videoPlaceholder) videoPlaceholder.style.display = 'flex';
        if(scanLine) scanLine.style.opacity = '0';
    }

    // When scanner overlay is hidden (Should be called from hideOverlaySection or close button)
    function onScannerHide() {
         
         if (scannerControl && typeof scannerControl.stopScan === 'function') {
             scannerControl.stopScan();
         } else if (typeof stopScan === 'function') { // Fallback if stopScan is global
             stopScan(); 
         } else {
             console.warn("Could not stop scanner.");
         }
         // Hide scan line, show placeholder might be needed depending on flow
         if(scanLine) scanLine.style.opacity = '0';
         if(videoPlaceholder) videoPlaceholder.style.display = 'flex'; // Show placeholder again
    }
    
    
    // Starting scan with the button INSIDE the scanner section
    if(startScanButton) {
        startScanButton.addEventListener('click', async () => {
            
            if (scannerControl && typeof scannerControl.startScan === 'function') {
                try {
                    await scannerControl.startScan(); 
                    // Hide placeholder, show scan line on successful start
                    if(videoPlaceholder) videoPlaceholder.style.display = 'none';
                    if(scanLine) scanLine.style.opacity = '1'; 
                } catch (err) {
                    console.error("Error starting scan:", err);
                    // Handle error display inside #scanStatus
                    const scanStatus = document.getElementById('scanStatus');
                    if (scanStatus) scanStatus.textContent = `Error: ${err.message || 'Could not start camera.'}`;
                }
            } else if (typeof startScan === 'function') { // Fallback
                 try {
                    await startScan(); 
                    if(videoPlaceholder) videoPlaceholder.style.display = 'none';
                    if(scanLine) scanLine.style.opacity = '1'; 
                } catch (err) { 
                    console.error("Error starting scan:", err);
                    const scanStatus = document.getElementById('scanStatus');
                    if (scanStatus) scanStatus.textContent = `Error: ${err.message || 'Could not start camera.'}`;
                }
            } else {
                console.warn("startScan function not found.");
                 const scanStatus = document.getElementById('scanStatus');
                 if (scanStatus) scanStatus.textContent = 'Scanner function not available.';
            }
        });
         
    } else {
         console.warn('[Scanner] Begin Scan button not found.');
    }

    // --- CLOSE OVERLAY BUTTON LISTENER --- 
    document.addEventListener('click', function(event) {
        if (event.target.matches('.close-section-btn')) {
            const targetOverlayId = event.target.getAttribute('data-target');
            if (targetOverlayId) {
                hideOverlaySection(targetOverlayId);
            }
        }
    });
    // --- END CLOSE OVERLAY BUTTON LISTENER ---

    // --- STATUS MODAL CLOSE BUTTON LISTENER ---
    const statusModalCloseBtn = document.getElementById('close-status-modal-btn');
    const statusModalOverlay = document.getElementById('status-modal-overlay');
    if (statusModalCloseBtn && statusModalOverlay) {
        statusModalCloseBtn.addEventListener('click', () => {
            statusModalOverlay.classList.remove('visible');
            // Optionally, add logic here if closing the modal needs to stop a process
            
        });
    }
    // --- END STATUS MODAL CLOSE BUTTON LISTENER ---

    // --- ADD OVERLAY TRIGGER LISTENERS ---
    // (Ensure these are placed appropriately, e.g., inside DOMContentLoaded or called from init)
    const openScannerBtn = document.getElementById('open-scanner-btn');
    if (openScannerBtn) {
        openScannerBtn.addEventListener('click', () => {
            
            showOverlaySection('qr-overlay');
        });
    }

    const scanQrTopLink = document.getElementById('nav-scan-top'); // May not exist anymore
    if (scanQrTopLink) {
        scanQrTopLink.addEventListener('click', (e) => {
            e.preventDefault();
            
            showOverlaySection('qr-overlay');
        });
    }

    const profileLink = document.getElementById('nav-profile');
    if (profileLink) {
        profileLink.addEventListener('click', function(e) {
            e.preventDefault();
            
            showOverlaySection('profile-overlay'); // Target overlay wrapper 
            // loadProfileData(); // No longer needed here, loaded on page load
            const dropdown = document.getElementById('user-menu-dropdown');
             // Close the dropdown after clicking a link
             if (dropdown && dropdown.classList.contains('visible')) {
                 dropdown.classList.remove('visible');
             }
        });
    }
    // --- END OVERLAY TRIGGER LISTENERS ---

    // Load Attendance Stats (Placeholder for now)
    loadAttendanceStats();

    // Load Profile Data in the background
    loadProfileData();

});

// Set up navigation menu
function setupNavigation() {
    // Select both main nav links and the profile edit link
    const navLinks = document.querySelectorAll('.sidebar .nav-link, .sidebar .profile-edit-link'); 
    const sections = {
        'nav-scan': document.getElementById('qr-scanner-section'),
        'nav-attendance': document.getElementById('attendance-section'),
        'nav-profile': document.getElementById('profile-section')
    };
    const dashboardActions = document.querySelector('.dashboard-actions'); // Get the button container

    navLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            // Prevent default for links managing dashboard sections
            if (sections[this.id]) {
                e.preventDefault();
                // Hide all sections
                Object.values(sections).forEach(section => {
                    if (section) section.style.display = 'none';
                });
                // Show the target section
                if (sections[this.id]) {
                    sections[this.id].style.display = 'block';
                    // Show/hide the main scan button based on the active section
                    if (dashboardActions) {
                        dashboardActions.style.display = (this.id === 'nav-scan') ? 'block' : 'none';
                    }
                    // Load data if profile section is shown
                    if (this.id === 'nav-profile') {
                        loadProfileData();
                    }
                }
                // Set active nav link
                setActiveNav(this.id);
            } else if (this.id === 'logout-btn') {
                e.preventDefault();
                logout();
            }
            // Allow default for other links like 'Home'
        });
    });
}

// Set active navigation item
function setActiveNav(navId) {
    // Remove active class from all nav links
    document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.remove('active');
    });
    
    // Add active class to selected nav link
    const activeNav = document.getElementById(navId);
    if (activeNav) {
        activeNav.classList.add('active');
    }
}

// Initialize dashboard
async function initDashboard() {
    console.log("[initDashboard] >>> Starting function...");
    try {
        // Always check authentication status with the server
        console.log("[initDashboard] >>> Calling /auth/check-auth...");
        const response = await fetch(`${API_URL}/auth/check-auth`, {
            credentials: 'include',
            headers: {
                'Accept': 'application/json',
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0'
            }
        });

        console.log(`[initDashboard] >>> /check-auth raw response: status=${response.status}, ok=${response.ok}`);

        let data = {}; // Initialize data
        try {
            data = await response.json();
            console.log("[initDashboard] >>> /check-auth parsed data:", JSON.stringify(data, null, 2));
        } catch (parseError) {
            console.error("[initDashboard] >>> Failed to parse /check-auth response:", parseError);
            // Handle cases where response might not be JSON (e.g., server error page)
            data = { authenticated: false, message: "Invalid response from server." }; 
        }

        if (response.ok && data.authenticated && data.user) {
            console.log("[initDashboard] >>> Entering SUCCESS block (authenticated).");
            // Store/update user info in sessionStorage
            sessionStorage.setItem('userId', data.user.id);
            sessionStorage.setItem('userRole', data.user.role);
            sessionStorage.setItem('firstName', data.user.firstName);
            sessionStorage.setItem('lastName', data.user.lastName);
            sessionStorage.setItem('userName', `${data.user.firstName} ${data.user.lastName}`);
            if (data.user.studentId) {
                sessionStorage.setItem('studentId', data.user.studentId);
            } else {
                sessionStorage.removeItem('studentId');
            }
            
        } else {
            console.log("[initDashboard] >>> Entering FAILURE block (not authenticated or error).");
            // Clear potentially stale session data
            sessionStorage.clear();

            // Show 'Session Expired' modal before redirecting
            const modalOverlay = document.getElementById('status-modal-overlay');
            const modalIconContainer = document.getElementById('status-modal-icon-container');
            const modalMessage = document.getElementById('status-modal-message');
            const modalCloseBtn = document.getElementById('close-status-modal-btn');

            if (modalOverlay && modalIconContainer && modalMessage && modalCloseBtn) {
                console.log("[initDashboard] >>> Showing 'Session Expired' modal...");
                modalIconContainer.innerHTML = '<span class="status-icon warning">⚠️</span>'; 
                modalMessage.textContent = data.message || "Session expired. Please log in again.";
                modalCloseBtn.style.display = 'none'; 
                modalOverlay.classList.add('visible');

                // Redirect after a delay
                console.log("[initDashboard] >>> Setting redirect timer to login page...");
                setTimeout(() => {
                    console.log("[initDashboard] >>> Executing redirect now.");
                    window.location.href = getBasePath() + '/pages/login.html';
                }, 3000); 
            } else {
                 console.error("[initDashboard] >>> Could not find status modal elements for session expiration message.");
                window.location.href = getBasePath() + '/pages/login.html';
            }
            return; 
        }

    } catch (error) {
        console.error("[initDashboard] >>> Error during initial authentication check:", error);
        showError("Failed to check authentication status. Please try logging in.");
        sessionStorage.clear();
        console.log("[initDashboard] >>> Setting redirect timer (due to CATCH block)...");
        setTimeout(() => {
             window.location.href = getBasePath() + '/pages/login.html';
        }, 3000);
        return; 
    }
    
    console.log("[initDashboard] >>> Function finished (authenticated path).");
}

// Update loadAttendanceHistory for new structure
async function loadAttendanceHistory() {
        const historyDiv = document.getElementById('attendance-records');
        if (!historyDiv) {
        console.error("Attendance records element not found (#attendance-records)");
            return;
        }
    historyDiv.innerHTML = '<div class="spinner"></div>'; // Use spinner instead

    try {
        // Use fetchWithAuth helper if implemented, otherwise keep original fetch
        const response = await fetchWithAuth(`${API_URL}/auth/student-attendance-history`);
        const data = await response.json();
        
        
        // Process data (dummy or real)
        if (data.success && data.history && data.history.length > 0) {
            let historyHTML = ''; // Start empty
            data.history.forEach(record => {
                let formattedTime = 'Unknown Time';
                let formattedDate = 'Unknown Date';
                // Use the correct field names from dummy data or API
                let teacherName = record.teacherName || 'Unknown Teacher'; 
                let sectionName = record.section || 'Unknown Section'; 
                
                try {
                    if (record.timestamp) {
                        const recordTime = new Date(record.timestamp);
                        if (!isNaN(recordTime.getTime())) {
                             // Format date and time separately
                             formattedDate = recordTime.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                             formattedTime = recordTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
                         } else {
                             console.warn(`Invalid timestamp format received: ${record.timestamp}`);
                             formattedDate = 'Invalid Date';
                             formattedTime = 'Invalid Time';
                        }
                    }
                } catch (timeError) {
                    console.error('Error formatting time:', timeError);
                }
                
                // Determine status class and text
                const status = record.status || 'Present'; // Default to Present
                const statusClass = status.toLowerCase() === 'absent' ? 'absent' : 'present';

                historyHTML += `
                    <div class="activity-item">
                        <div class="activity-info">
                            <span class="activity-subject">${record.subject || 'Unknown Subject'}</span>
                            <span class="activity-details">Section: ${sectionName}</span>
                            <span class="activity-details">Teacher: ${teacherName}</span>
                            <span class="activity-details">${formattedDate} at ${formattedTime}</span>
                        </div>
                        <span class="activity-status ${statusClass}">${status}</span>
                    </div>
                `;
            });
            historyDiv.innerHTML = historyHTML;
        } else {
            historyDiv.innerHTML = '<p>No recent activity found.</p>'; // Simpler empty state
        }
    } catch (error) {
        console.error('Error loading attendance history:', error);
        historyDiv.innerHTML = '<p>Error loading activity.</p>'; // Simpler error state
    }
}

// Helper function for relative time formatting (Example)
function formatRelativeTime(date) {
  const now = new Date();
  const diffInSeconds = Math.floor((now - date) / 1000);
  const diffInMinutes = Math.floor(diffInSeconds / 60);
  const diffInHours = Math.floor(diffInMinutes / 60);
  const diffInDays = Math.floor(diffInHours / 24);

  if (diffInDays === 0) {
    // Today
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  } else if (diffInDays === 1) {
    // Yesterday
    return `Yesterday, ${date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`;
  } else {
    // Older date
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }
}

// Record attendance from QR code
async function recordAttendance() {
    // --- Get session ID (keep existing logic) ---
    const sessionId = sessionStorage.getItem('currentSessionId');
        if (!sessionId) {
        // Use the modal for this feedback too
        alert('Error: No QR session found. Please scan a valid QR code.');
            return;
        }
        
    // --- Get Button Element (keep existing logic) ---
    const btnElement = document.getElementById('record-attendance-btn');
    if (!btnElement) {
        console.error("Record attendance button not found");
        alert('Error: UI element missing. Cannot record attendance.');
        return;
    }
        
    // --- Disable button and show processing (optional: add a processing modal/indicator) ---
        btnElement.disabled = true;
        btnElement.textContent = 'Processing...';
    // Consider adding a subtle processing indicator if needed
        
    try {
        // --- Fetch Request (keep existing logic) ---
        const response = await fetch(`${API_URL}/auth/record-attendance`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ session_id: sessionId })
        });
        
        const data = await response.json();
        
        
        // --- Handle Response using Modal ---
        if (data.success) {
            // Format details for the modal
            const details = `Subject: <strong>${data.subject || 'N/A'}</strong><br>Time: <strong>${formatDateToUTC8(new Date())}</strong>`;
            alert(`Attendance Recorded!\nSubject: ${data.subject || 'N/A'}\nTime: ${formatDateToUTC8(new Date())}`);
            
            // Clear session data after successful recording
            sessionStorage.removeItem('currentSessionId');
            sessionStorage.removeItem('currentTeacherId');
            
            // Reload attendance history
            loadAttendanceHistory();
        } else {
            // Show error in modal
            alert(`Recording Failed: ${data.message || 'Error recording attendance'}`);
        }
        // --- End Modal Handling ---
        
    } catch (error) {
        console.error('Attendance recording error:', error);
        // --- Show Catch Error in Modal ---
        alert(`Server Error: ${error.message}`);
        // --- End Modal Handling ---
    } finally {
        // --- Re-enable button (always run) ---
        if (btnElement) {
        btnElement.disabled = false;
            btnElement.textContent = 'Record Attendance'; // Or whatever the original text was
        }
    }
}

// Helper function to format dates in UTC+8
function formatDateToUTC8(date) {
    try {
        // Convert to UTC+8
        const utc8Date = new Date(date.getTime() + (8 * 60 * 60 * 1000));
        return utc8Date.toLocaleString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: true
        });
    } catch (error) {
        console.error('Date formatting error:', error);
        return 'Unknown Date';
    }
}

// Function to show error messages
function showError(message) {
    console.error(message);
    const errorDiv = document.getElementById('error-message');
    if (errorDiv) {
        errorDiv.textContent = message;
        errorDiv.style.display = 'block';
        
        // Auto-hide after 5 seconds
        setTimeout(() => {
            errorDiv.style.display = 'none';
        }, 5000);
    }
}

// Logout function
async function logout(logoutButtonElement) {
    // Modal elements
    const modalOverlay = document.getElementById('status-modal-overlay');
    const modalIconContainer = document.getElementById('status-modal-icon-container');
    const modalMessage = document.getElementById('status-modal-message');

    if (!modalOverlay || !modalIconContainer || !modalMessage) {
        console.error("Status modal elements not found for logout action!");
        // Proceed without modal if elements are missing
    } else {
        // --- Show Loading Modal ---
        modalIconContainer.innerHTML = '<div class="spinner"></div>';
        modalMessage.textContent = 'Logging out...';
        modalOverlay.classList.add('visible');
        if (logoutButtonElement) logoutButtonElement.disabled = true;
        // --- End Show Loading Modal ---
    }

    
    try {
        // Call the logout endpoint
        const response = await fetch(`${API_URL}/auth/logout`, {
            method: 'POST',
            credentials: 'include',
            headers: {
                'Accept': 'application/json'
            }
        });
        
        // Clear sessionStorage
        sessionStorage.clear();
        
        // Redirect to login page
        window.location.href = getBasePath() + '/pages/login.html';
    } catch (error) {
        console.error('Logout error:', error);
        // Even if the server request fails, clear local storage and redirect
        sessionStorage.clear();
        window.location.href = getBasePath() + '/pages/login.html';
    }
}

// Helper function to get base path - same as in login.js
function getBasePath() {
    const isLocalDevelopment =
        window.location.protocol === 'file:' ||
        ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);

    return isLocalDevelopment ? '/apps/web' : '';
}

// Function that attaches event listeners for debug buttons
function setupDebugListeners() {
    // Debug buttons
    const testCookiesBtn = document.getElementById('test-cookies-btn');
    const checkAuthBtn = document.getElementById('check-auth-btn');
    
    if (testCookiesBtn) {
        testCookiesBtn.addEventListener('click', async function() {
            try {
                const response = await fetch(`${API_URL}/auth/debug-cookies`, {
            credentials: 'include'
                });
                const data = await response.json();
                
                
                alert(`Cookie test: ${JSON.stringify(data)}`);
            } catch (error) {
                console.error('Cookie test error:', error);
                alert(`Error: ${error.message}`);
            }
        });
    }
    
    if (checkAuthBtn) {
        checkAuthBtn.addEventListener('click', async function() {
            try {
                // Use the same authentication approach as the main dashboard init
                const userId = sessionStorage.getItem('userId');
                const userRole = sessionStorage.getItem('userRole');
                const headers = {
                    'Accept': 'application/json',
                    'Cache-Control': 'no-cache'
                };
                
                // Add user headers if available in sessionStorage as fallback
                if (userId && userRole) {
                    headers['X-User-ID'] = userId;
                    headers['X-User-Role'] = userRole;
                }
                
                const response = await fetch(`${API_URL}/auth/check-auth`, {
                    credentials: 'include',
                    headers: headers
                });
                const data = await response.json();
                
                
                alert(`Auth check: ${JSON.stringify(data)}`);
            } catch (error) {
                console.error('Auth check error:', error);
                alert(`Error: ${error.message}`);
            }
        });
    }
}

// --- NEW PROFILE FUNCTIONS (Refactored for Modal Behavior) --- 

function showStudentProfileModal() {
    const modalOverlay = document.getElementById('profile-overlay');
    if (modalOverlay) {
        modalOverlay.classList.add('visible'); // Use visible class
        document.body.style.overflow = 'hidden'; // Prevent background scroll
        loadProfileData(); // Load data when modal is shown
    } else {
        console.error("Student profile overlay element (#profile-overlay) not found.");
    }
}

function hideStudentProfileModal() {
    const modalOverlay = document.getElementById('profile-overlay');
    if (modalOverlay) {
        modalOverlay.classList.remove('visible');
        document.body.style.overflow = ''; // Restore background scroll
        // Clear any previous messages when hiding
        const messageArea = document.getElementById('profile-message');
        if (messageArea) {
            messageArea.textContent = '';
            messageArea.className = '';
        }
    }
}

// Modified loadProfileData to include loading state
async function loadProfileData() {
    const studentIdInput = document.getElementById('profile-student-id');
    const firstNameInput = document.getElementById('profile-first-name');
    const lastNameInput = document.getElementById('profile-last-name');
    const profileMessage = document.getElementById('profile-message');
    const saveButton = document.getElementById('save-profile-btn'); // Get save button

    if (!studentIdInput || !firstNameInput || !lastNameInput || !profileMessage || !saveButton) { // Check save button
        console.error('Profile form elements not found for loading.');
        if (profileMessage) { // Show error if message area exists
             profileMessage.textContent = 'Error: UI elements missing.';
             profileMessage.className = 'error-message';
        }
        return;
    }

    // --- Add Loading State ---
    profileMessage.textContent = 'Loading profile...';
    profileMessage.className = 'info-message'; 
    saveButton.disabled = true; // Disable save button
    studentIdInput.value = 'Loading...'; // Show loading in inputs too
    firstNameInput.value = '';
    lastNameInput.value = '';
    // --- End Loading State ---

    try {
        // Fetch uses /auth/profile which is correct for students
        const response = await fetchWithAuth(`/auth/profile`); 
        const data = await response.json();

        if (data.success && data.user) {
            studentIdInput.value = data.user.student_id || 'N/A'; // Use student_id field
            firstNameInput.value = data.user.first_name || '';
            lastNameInput.value = data.user.last_name || '';
            profileMessage.textContent = ''; // Clear loading message
            profileMessage.className = '';
        } else {
            console.error('Failed to load profile data:', data.message);
            profileMessage.textContent = `Error loading profile: ${data.message || 'Unauthorized: Please log in.'}`; // More specific error
            profileMessage.className = 'error-message';
            studentIdInput.value = 'Error'; // Indicate error in inputs
        }
    } catch (error) {
        console.error('Error fetching profile data:', error);
        profileMessage.textContent = `Network error: ${error.message}`;
        profileMessage.className = 'error-message';
        studentIdInput.value = 'Error';
    } finally {
        saveButton.disabled = false; // Re-enable save button
    }
}

// Modified handleProfileUpdate to include saving state
async function handleProfileUpdate(event) {
    event.preventDefault(); // Prevent default form submission

    const firstNameInput = document.getElementById('profile-first-name');
    const lastNameInput = document.getElementById('profile-last-name');
    const profileMessage = document.getElementById('profile-message');
    const saveButton = document.getElementById('save-profile-btn');

    if (!firstNameInput || !lastNameInput || !profileMessage || !saveButton) {
        console.error('Profile form elements for update not found');
        return;
    }

    const updatedProfile = {
        firstName: firstNameInput.value.trim(),
        lastName: lastNameInput.value.trim()
    };

    // Basic validation
    if (!updatedProfile.firstName || !updatedProfile.lastName) {
        profileMessage.textContent = 'First name and last name cannot be empty.';
        profileMessage.className = 'error-message';
        return;
    }

    // --- Add Saving State ---
    const originalButtonHTML = saveButton.innerHTML; // Store original content
    saveButton.disabled = true;
    // Set loading state (adjust spinner class if needed)
    saveButton.innerHTML = '<div class="spinner spinner-small" style="width: 1.2em; height: 1.2em; border-width: 2px; display: inline-block; margin-right: 0.5em; vertical-align: text-bottom;"></div> Saving...'; 
    profileMessage.textContent = '';
    profileMessage.className = '';
    // --- End Saving State ---

    try {
        // Fetch uses PUT /auth/profile which is correct for students
        const response = await fetchWithAuth(`/auth/profile`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(updatedProfile)
        });
        
        const data = await response.json();
        
        if (data.success) {
            profileMessage.textContent = 'Profile updated successfully!';
            profileMessage.className = 'success-message';
            
            // Update sessionStorage and welcome message
            sessionStorage.setItem('firstName', updatedProfile.firstName);
            sessionStorage.setItem('lastName', updatedProfile.lastName);
            const newUserName = `${updatedProfile.firstName} ${updatedProfile.lastName}`;
            sessionStorage.setItem('userName', newUserName);
        
            // Update header display immediately
            const userAvatar = document.querySelector('.user-avatar');
            if (userAvatar) userAvatar.textContent = updatedProfile.firstName.charAt(0).toUpperCase();

            // Hide success message after a delay
            setTimeout(() => { 
                 if (profileMessage.textContent === 'Profile updated successfully!') {
                    profileMessage.textContent = ''; 
                    profileMessage.className = '';
                 }
            }, 3000);

        } else {
            profileMessage.textContent = `Update failed: ${data.message || 'Unknown error'}`;
            profileMessage.className = 'error-message';
        }

    } catch (error) {
        console.error('Error updating profile:', error);
        profileMessage.textContent = `Network error: ${error.message}`;
        profileMessage.className = 'error-message';
    } finally {
        // --- Restore Button State ---
        saveButton.disabled = false;
        saveButton.innerHTML = originalButtonHTML; // Restore original content
        // --- End Restore Button State ---
    }
}

// Attach listener to profile form WITHIN the main DOMContentLoaded or init function
document.addEventListener('DOMContentLoaded', () => {
    setupNavigation(); // Call the setup function
    
    const profileForm = document.getElementById('profile-form');
    if (profileForm) {
        profileForm.addEventListener('submit', handleProfileUpdate);
    }

    // --- Adjust Listeners for Modal Behavior ---
    
    // 1. Update profile link listener
    const profileLink = document.getElementById('nav-profile');
    if (profileLink) {
        profileLink.addEventListener('click', function(e) {
            e.preventDefault();
            showStudentProfileModal(); // Call the new show function
            // Close the dropdown menu if open
            const dropdown = document.getElementById('user-menu-dropdown');
            if (dropdown && dropdown.classList.contains('visible')) {
                 dropdown.classList.remove('visible');
             }
        });
    }

    // 2. Update close button listener
    const profileSection = document.getElementById('profile-section');
    if (profileSection) {
        const closeBtn = profileSection.querySelector('.close-section-btn');
        if (closeBtn) {
             closeBtn.addEventListener('click', () => {
                 hideStudentProfileModal(); // Call the new hide function
             });
        }
    }

    // 3. Add click outside listener
    const profileOverlay = document.getElementById('profile-overlay');
    if (profileOverlay) {
        profileOverlay.addEventListener('click', (event) => {
             // If the click is directly on the overlay (background), hide the modal
             if (event.target === profileOverlay) {
                 hideStudentProfileModal();
             }
        });
    }
    // --- End Adjust Listeners ---

    // Initial section hiding should be handled by setupNavigation or init logic
});

// --- END PROFILE FUNCTIONS --- 

// --- NEW Function to Load Student Info Card Data --- 
async function loadStudentInfoCardData() {
    const nameElement = document.getElementById('student-info-name');
    const idElement = document.getElementById('student-info-id');

    if (!nameElement || !idElement) {
        console.error('Student info card elements not found.');
        return;
    }

    // Set loading state
    nameElement.textContent = 'Loading...';
    idElement.textContent = '...';

    try {
        // Fetch profile data (already authenticated by page load/initDashboard)
        const response = await fetchWithAuth(`/auth/profile`); // Endpoint for student profile
        const data = await response.json();

        if (data.success && data.user) {
            const firstName = data.user.first_name || '';
            const lastName = data.user.last_name || '';
            const studentId = data.user.student_id || 'N/A'; // Use student_id field
            const displayName = (firstName && lastName) ? `${firstName} ${lastName}` : 'Student';

            nameElement.textContent = displayName;
            idElement.textContent = studentId;

            // Optional: Update sessionStorage as well for other potential uses (like header)
            // sessionStorage.setItem('firstName', firstName);
            // sessionStorage.setItem('lastName', lastName);
            // sessionStorage.setItem('studentId', studentId);

        } else {
            console.error('Failed to load student info card data:', data.message);
            nameElement.textContent = 'Error';
            idElement.textContent = 'Error';
        }
    } catch (error) {
        console.error('Error fetching student info card data:', error);
        nameElement.textContent = 'Error';
        idElement.textContent = 'Error';
    }
}
// --- END Function to Load Student Info Card Data --- 

// Function to show attendance popup (NOW USES GLOBAL MODAL)
async function showAttendancePopup(sessionId, teacherId, subject) {
    
    

    // Use setTimeout to ensure DOM is ready before accessing/showing modal
    setTimeout(async () => {
        
        // --- Get Modal Elements INSIDE setTimeout ---
        const modalOverlay = document.getElementById('status-modal-overlay');
        const modalIconContainer = document.getElementById('status-modal-icon-container');
        const modalMessage = document.getElementById('status-modal-message');
        const modalCloseBtn = document.getElementById('close-status-modal-btn'); // Get close button

        if (!modalOverlay || !modalIconContainer || !modalMessage || !modalCloseBtn) { // Check close button
            console.error("DEBUG: Status modal elements (including close btn) NOT found, showing alert.");
            alert("Processing attendance... Check console for details."); // Fallback alert
            // Attempt to record attendance without modal feedback if elements are missing
            await recordAttendanceFetch(sessionId); // Pass null for modal elements
            return; // Exit setTimeout callback
        } else {
            
            // --- Show EXCITABLE Loading Modal ---
            // modalIconContainer.innerHTML = '<div class="spinner"></div>'; // OLD WAY
            // --- Create and Append Spinner Element --- 
            const spinnerElement = document.createElement('div');
            spinnerElement.classList.add('spinner');
            modalIconContainer.innerHTML = ''; // Clear container first
            modalIconContainer.appendChild(spinnerElement);
            // --- End Create and Append ---
            modalMessage.textContent = 'Processing Scan...'; // Updated message
            modalCloseBtn.style.display = 'block'; // Show the close button
            modalOverlay.classList.add('visible');
            // --- End Show Loading Modal ---

             // --- Close scanner overlay immediately after showing processing modal --- 
             
             hideOverlaySection('qr-overlay'); 
            // --- End close scanner overlay --- 

            // --- Force short delay for spinner rendering ---
            // Added log
            await new Promise(resolve => setTimeout(resolve, 150)); // Increased delay to 150ms
            // Added log
            // --- End Force Delay ---
        }

        // Now perform the fetch and update logic, passing modal elements
        await recordAttendanceFetch(sessionId, modalOverlay, modalIconContainer, modalMessage, modalCloseBtn); // Fetch happens AFTER modal *should* be visible

    }, 50); // Reduced outer delay back to 50ms, inner delay handles rendering
}

// Separate function for the fetch/update logic to keep it clean
async function recordAttendanceFetch(sessionId, modalOverlay = null, modalIconContainer = null, modalMessage = null, modalCloseBtn = null) { // Added modalCloseBtn
    
    try {
        // Corrected endpoint path to include /auth
        const response = await fetch(`${API_URL}/auth/record-attendance`, { 
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ session_id: sessionId })
        });
        
        const data = await response.json();
        
        

        // --- Update Status Modal with Result (if elements exist) ---
        if (modalIconContainer && modalMessage && modalCloseBtn && modalOverlay?.classList.contains('visible')) { // Check if modal is still visible
            // LOG ADDED
           

            if (data.success) {
                
                 // LOG ADDED
                modalIconContainer.innerHTML = '<span class="status-icon success">✅</span>';
                modalMessage.innerHTML = `Attendance Recorded!<br><small>Subject: ${data.subject || 'N/A'}<br>Time: ${formatLocalDateTime(new Date())}</small>`; // Include details
                
                // Dispatch event for history update
                document.dispatchEvent(new CustomEvent('attendance-recorded', {
                    detail: { success: true, subject: data.subject, timestamp: new Date().toISOString() }
                }));

                // --- Refresh stats after successful recording --- 
                loadAttendanceStats();
            } else {
                // REMOVED -> .");
                modalIconContainer.innerHTML = '<span class="status-icon error">❌</span>';
                modalMessage.textContent = `Recording Failed: ${data.message || 'Unknown error'}`;
                
                 // --- Close scanner overlay even if already recorded --- 
                if (data.message && data.message.toLowerCase().includes('already been recorded')) {
                    
                    // hideOverlaySection('qr-overlay'); // REMOVED - Now closed earlier
                }
                // --- End close scanner on duplicate ---
            }
            // LOG ADDED
        } else if (!modalOverlay?.classList.contains('visible')) {
             
             // Optionally show an alert or console log if the modal was closed before completion
             return; // Stop processing if modal was closed
        } else {
             console.error(">>> Modal elements missing when trying to update status! Cannot show result.", {modalIconContainer, modalMessage, modalCloseBtn, modalOverlay}); // LOG ADDED
        }
         // --- End Update Status Modal ---

        // --- Fallback Alert if Modal Elements Missing (Shouldn't happen if initial check passed) ---
        if (!modalIconContainer || !modalMessage) {
            alert(data.success ? `Attendance Recorded!\nSubject: ${data.subject || 'N/A'}` : `Recording Failed: ${data.message || 'Unknown error'}`);
        }

    } catch (error) {
        console.error('Attendance recording error:', error);
        // --- Update Status Modal with Network Error (if elements exist and modal visible) ---
        if (modalIconContainer && modalMessage && modalCloseBtn && modalOverlay?.classList.contains('visible')) {
            modalCloseBtn.style.display = 'none'; // Hide close button
            modalIconContainer.innerHTML = '<span class="status-icon error">❌</span>';
            modalMessage.textContent = `Server Error: ${error.message}`;
        } else if (!modalOverlay?.classList.contains('visible')) {
            
            return; // Stop processing if modal was closed
        } else {
            alert(`Server Error: ${error.message}`); // Fallback alert
        }
    } finally {
     
        // LOG ADDED
        // --- End Hide Modal ---
    }
}

// --- Mobile Menu Toggle --- 
function setupMobileMenu() {
    const toggleBtn = document.getElementById('mobile-menu-toggle');
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.getElementById('mobile-menu-overlay'); // Get overlay

    if (toggleBtn && sidebar && overlay) { // Check overlay exists
        toggleBtn.addEventListener('click', () => {
            sidebar.classList.toggle('mobile-open');
            overlay.classList.toggle('visible'); // Toggle overlay visibility
            // Hide button when menu opens, show when it closes (on mobile)
            if (window.innerWidth <= 768) { // Only apply on mobile view
                toggleBtn.style.display = sidebar.classList.contains('mobile-open') ? 'none' : 'block';
            }
        });

        // Optional: Close menu when clicking a nav link inside
        sidebar.querySelectorAll('.nav-link').forEach(link => {
            link.addEventListener('click', () => {
                // Only close if it's currently open (for mobile view)
                if (sidebar.classList.contains('mobile-open')) {
                    sidebar.classList.remove('mobile-open');
                    overlay.classList.remove('visible'); // Hide overlay
                    // Ensure button reappears when menu closes via link click
                    if (window.innerWidth <= 768) {
                        toggleBtn.style.display = 'block'; 
                    }
                }
            });
        });

        // Optional: Close menu when clicking outside (on main content)
        const mainContent = document.querySelector('.main-content');
        if (mainContent) {
            mainContent.addEventListener('click', (event) => {
                if (sidebar.classList.contains('mobile-open') && !sidebar.contains(event.target) && !toggleBtn.contains(event.target)) {
                    sidebar.classList.remove('mobile-open');
                    overlay.classList.remove('visible'); // Hide overlay
                    // Ensure button reappears when menu closes via outside click
                    if (window.innerWidth <= 768) {
                         toggleBtn.style.display = 'block';
                    }
                }
            });
        }

        // Add listener to overlay to close menu
        overlay.addEventListener('click', () => {
            sidebar.classList.remove('mobile-open');
            overlay.classList.remove('visible');
            if (window.innerWidth <= 768) { // Show toggle button
                toggleBtn.style.display = 'block'; 
            }
        });
    } else {
        console.warn("Mobile menu toggle button, sidebar, or overlay not found.");
    }
}
// --- End Mobile Menu Toggle --- 

// Add event listeners for dropdown items (already have IDs)
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', function(e) {
            e.preventDefault();
            logout(this); // Pass button if needed for disabling
        });
        
    } else {
        console.error('Logout button not found (dropdown).');
    }

    const profileLink = document.getElementById('nav-profile');
    if (profileLink) {
        profileLink.addEventListener('click', function(e) {
            e.preventDefault();
            
            showOverlaySection('profile-overlay'); // Target overlay wrapper 
            // loadProfileData(); // No longer needed here, loaded on page load
            const dropdown = document.getElementById('user-menu-dropdown');
             // Close the dropdown after clicking a link
             if (dropdown && dropdown.classList.contains('visible')) {
                 dropdown.classList.remove('visible');
             }
        });
    }

// --- Shared Overlay Functions ---
function showOverlaySection(sectionId) {
    
    const section = document.getElementById(sectionId);
    if (section) {
        section.classList.add('visible');
        document.body.style.overflow = 'hidden'; // Disable body scroll
        // Specific setup for scanner
        if (sectionId === 'qr-overlay' && typeof onScannerShow === 'function') {
             onScannerShow();
        }
    } else {
        console.warn(`Overlay section with ID ${sectionId} not found.`);
    }
}

function hideOverlaySection(sectionId) {
    
    const section = document.getElementById(sectionId);
    if (section) {
        section.classList.remove('visible');
        document.body.style.overflow = ''; // Re-enable body scroll
         // Specific cleanup for scanner
        if (sectionId === 'qr-overlay' && typeof onScannerHide === 'function') {
             onScannerHide();
        }
    } else {
        console.warn(`Overlay section with ID ${sectionId} not found.`);
    }
}

// --- Overlay Section Triggers --- 
const openScannerBtn = document.getElementById('open-scanner-btn');
const scanQrTopLink = document.getElementById('nav-scan-top');
// Profile link handled in DOMContentLoaded

if (openScannerBtn) {
    openScannerBtn.addEventListener('click', () => {
        
        showOverlaySection('qr-overlay'); // Target overlay wrapper
        // Potentially auto-start scanner here
    });
}

if (scanQrTopLink) {
    scanQrTopLink.addEventListener('click', (e) => {
        e.preventDefault();
        
        showOverlaySection('qr-overlay'); // Target overlay wrapper
        // Potentially auto-start scanner here
    });
}

// --- Function to Load Attendance Stats --- 
async function loadAttendanceStats() {
    const countElement = document.getElementById('total-attended-count');
    if (!countElement) {
        console.error('Element #total-attended-count not found.');
        return;
    }

    // countElement.textContent = 'Loading...'; // Replace text with spinner
    countElement.innerHTML = '<div class="spinner"></div>'; // Use standard spinner size

    try {
        // Fetch the count from your new backend endpoint
        const response = await fetchWithAuth(`${API_URL}/auth/student-attendance-stats`); // <-- Replace with your actual endpoint if different
        const data = await response.json();

        if (data.success) {
            // Use the field name returned by your API (e.g., attendedCount)
            countElement.textContent = data.attendedCount || 0; // <-- Adjust 'attendedCount' if your API uses a different name
            
        } else {
            console.error('[Stats] API failed to return stats:', data.message);
            countElement.textContent = 'Err'; // Display error in the card
        }
        
    } catch (error) {
        console.error('Error loading attendance stats:', error);
        countElement.textContent = 'Error'; // Display error in the card
    }
}
// --- END Function to Load Attendance Stats ---
// --- END Function to Load Attendance Stats ---