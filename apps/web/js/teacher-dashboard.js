// Teacher Dashboard functionality

// --- Global Variables ---
// To hold the EventSource instance - REMOVED: let sseEventSource = null; 

// --- Role Check --- 
(function () {
    const userId = sessionStorage.getItem('userId');
    const userRole = sessionStorage.getItem('userRole');
    const expectedRole = 'teacher'; // Role expected for this page

    if (!userId || userRole !== expectedRole) {
        console.warn(`[Role Check - Teacher] Access denied. Role is ${userRole}, expected ${expectedRole}. Redirecting to login.`);
        // Clear potentially incorrect session data before redirecting
        sessionStorage.clear();
        // Use getBasePath if available, otherwise assume root or relative path
        const basePath = typeof getBasePath === 'function' ? getBasePath() : '';
        window.location.href = basePath + '/pages/login.html'; // Redirect to main login page
    }
})();
// --- End Role Check --- 


let recentAttendanceIntervalId = null; // Variable to hold the interval ID
let viewAttendanceIntervalId = null; // OLD: Interval ID for specific session view (no longer used for polling)
let currentViewSessionId = null; // NEW: Store the ID of the session being viewed
let generatedQrTimerIntervalId = null; // Timer specific to this display
let currentlyDisplayedSessionId = null; // Keep track of what's shown
let currentCalendarDate = new Date(); // State for the calendar's displayed month/year
let attendanceDatesSet = new Set(); // Set to store YYYY-MM-DD strings of dates with attendance
let currentSelectedClassId = null; // Store the currently selected class ID for calendar navigation

document.addEventListener('DOMContentLoaded', function () {
    const pageLoader = document.getElementById('full-page-loader');
    // Show loader immediately (it starts visible via CSS, but ensure no race conditions)
    if (pageLoader) pageLoader.classList.remove('hidden');


    // setupMobileMenu(); // Call the setup function for the mobile menu - REMOVED as elements are gone
    initDashboard();

    // Start polling for recent attendance records every 10 seconds
    // Clear any existing interval first (safety measure)
    if (recentAttendanceIntervalId) {
        clearInterval(recentAttendanceIntervalId);
    }

  

    // Check if the specific listener *for attendance class select* has already been attached 
    // (e.g., by qrcode.js if it loaded first and attached it - although it shouldn't anymore)
    // This is a more granular check than the broad flag.
    const attendanceClassSelect = document.getElementById('attendance-class-select');
    if (attendanceClassSelect && !attendanceClassSelect.dataset.listenerAttached) {
       
        attendanceClassSelect.addEventListener('change', function () {
            
            // --- STOP POLLING VIEW ATTENDANCE --- 
            if (viewAttendanceIntervalId) {
                clearInterval(viewAttendanceIntervalId);
                viewAttendanceIntervalId = null;
                
            }
            // --- END STOP POLLING ---
            loadSessions(this.value);
            const attendanceRecordsDiv = document.getElementById('attendance-records');
            if (attendanceRecordsDiv) attendanceRecordsDiv.innerHTML = '';
        });
        attendanceClassSelect.dataset.listenerAttached = 'true'; // Mark as attached
    } else if (attendanceClassSelect) {
        
    }

    // Attach other listeners unconditionally as they are specific to this dashboard
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', function (e) {
            e.preventDefault();
            logout(this);
        });
    }

    // --- NEW Navigation Logic ---
   
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        item.addEventListener('click', function (e) {
            const targetPageId = this.dataset.page;
            

            // Prevent default anchor link behavior for dashboard pages
                e.preventDefault();

            // Update active state on sidebar items
            navItems.forEach(navItem => navItem.classList.remove('active'));
            this.classList.add('active');
            
            // Show/hide page sections
            const pages = document.querySelectorAll('.page');
            pages.forEach(page => {
                if (page.id === targetPageId) {
                    page.classList.add('active');
                    
                } else {
                    page.classList.remove('active');
                }
            });
        });
    });
    // --- END NEW Navigation Logic ---

    // Attach session select listener (now safe to attach here)
    const sessionSelect = document.getElementById('session-select');
    if (sessionSelect && !sessionSelect.dataset.listenerAttached) {
        
        sessionSelect.addEventListener('change', async function () {
            // --- STOP POLLING VIEW ATTENDANCE --- 
            if (viewAttendanceIntervalId) {
                clearInterval(viewAttendanceIntervalId);
                viewAttendanceIntervalId = null;
                
            }
            // --- END STOP POLLING ---

            const attendanceRecordsDiv = document.getElementById('attendance-records');
            const sectionChoicesDiv = document.getElementById('section-choices');
            const sectionButtonsContainer = document.getElementById('section-buttons-container');

            // Clear previous attendance and section choices
            if (attendanceRecordsDiv) attendanceRecordsDiv.innerHTML = '';

            // --- Show Loading State for Sections --- 
            if (sectionButtonsContainer) {
                sectionButtonsContainer.innerHTML = '<p class="loading-indicator">Loading sections...</p>';
            }
            if (sectionChoicesDiv) sectionChoicesDiv.style.display = 'block'; // Show the container
            // --- End Loading State ---

            const selectedOption = this.options[this.selectedIndex];
            const classId = document.getElementById('attendance-class-select').value;
            const sessionDate = selectedOption.getAttribute('data-session-date');

            if (this.value && classId && sessionDate) {
                
                try {
                    const response = await fetch(`${API_URL}/auth/sessions-on-date?classId=${classId}&date=${sessionDate}`, {
                        method: 'GET',
                        credentials: 'include',
                        headers: {
                            'Accept': 'application/json',
                            'Cache-Control': 'no-cache'
                        }
                    });

                    if (!response.ok) {
                        throw new Error(`Failed to fetch sections: ${response.status}`);
                    }

                    const data = await response.json();
                    

                    // --- Populate Sections or Show Message --- 
                    if (sectionButtonsContainer) sectionButtonsContainer.innerHTML = ''; // Clear loading message
                    if (data.success && data.sections && data.sections.length > 0) {
                        if (sectionChoicesDiv) sectionChoicesDiv.style.display = 'block';

                        data.sections.forEach(sec => {
                            const button = document.createElement('button');
                            // Use new CSS classes for styling
                            button.textContent = sec.section || 'No Section';
                            button.className = 'btn btn-secondary section-choice-btn'; // Use general btn styles if defined
                            button.setAttribute('data-session-id', sec.session_id);

                            // --- MODIFIED: Clear view attendance interval on SECTION button click ---
                            button.addEventListener('click', function () {
                                // --- STOP POLLING VIEW ATTENDANCE (Keep this for safety) ---
                                if (viewAttendanceIntervalId) {
                                    clearInterval(viewAttendanceIntervalId);
                                    viewAttendanceIntervalId = null;
                                    //  // Log not needed
                                }
                                // --- END STOP POLLING ---

                                const specificSessionId = this.getAttribute('data-session-id');
                                currentViewSessionId = specificSessionId; // Store the current session ID
                                
                                loadAttendanceRecords(specificSessionId);
                            });

                            if (sectionButtonsContainer) sectionButtonsContainer.appendChild(button);
                        });

                    } else {
                        if (sectionChoicesDiv) sectionChoicesDiv.style.display = 'block'; // Still show container
                        if (sectionButtonsContainer) sectionButtonsContainer.innerHTML = '<p class="empty-message">No attendance sections found for this date.</p>';
                        if (attendanceRecordsDiv) attendanceRecordsDiv.innerHTML = ''; // Clear any previous records
                    }
                } catch (error) {
                    console.error('Error fetching sections:', error);
                    // --- Show Section Fetch Error --- 
                    if (sectionButtonsContainer) {
                        sectionButtonsContainer.innerHTML = `<p class="error-message">Error loading sections: ${error.message}</p>`;
                    }
                    if (sectionChoicesDiv) sectionChoicesDiv.style.display = 'block'; // Show container even on error
                }
            }
        });
        sessionSelect.dataset.listenerAttached = 'true';
    } else if (sessionSelect) {
        
    }

    // Initialize the dashboard logic (fetches user data, classes, etc.) if not already done
    if (!window.dashboardInitialized) {
   
        initDashboard(); // This function internally handles initial section visibility
        window.dashboardInitialized = true;
    } else {
        
        // If initDashboard was skipped, manually ensure the initial page is active
        const initialPage = document.getElementById('dashboard');
        const initialNavItem = document.querySelector('.nav-item[data-page="dashboard"]');
        if (initialPage && !initialPage.classList.contains('active')) {
            // Make sure only the dashboard page is active initially
            document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
            initialPage.classList.add('active');
        }
        if (initialNavItem && !initialNavItem.classList.contains('active')) {
            // Make sure only the dashboard nav item is active initially
            document.querySelectorAll('.nav-item').forEach(ni => ni.classList.remove('active'));
            initialNavItem.classList.add('active');
        }
        // Remove the old check for #teacher-section display
    }

    // Set up event listeners for QR code generation (button moved, but ID is the same)
    const generateQrCodeBtn = document.getElementById('generate-qr-code-btn');
    // const viewCurrentAttendanceBtn = document.getElementById('view-current-attendance-btn'); // ID doesn't exist in new HTML

    if (generateQrCodeBtn) {
        generateQrCodeBtn.addEventListener('click', generateQRCode);
    }

    // REMOVED: Listener for viewCurrentAttendanceBtn as it doesn't exist
    // if (viewCurrentAttendanceBtn) {
    //     viewCurrentAttendanceBtn.addEventListener('click', viewCurrentSessionAttendance);
    // }

    // Set up event listeners for class management (button ID is the same)
    const addClassBtn = document.getElementById('add-class-btn');

    if (addClassBtn) {
        addClassBtn.addEventListener('click', addNewClass);
    }

    // Set up debug listeners - REMOVE if debug buttons are gone
    // setupDebugListeners(); 

    // Log cookies for debugging
    

    // Check headers to debug CORS issues
    fetch(`${API_URL}/auth/debug-headers`, {
        credentials: 'include',
        headers: {
            'Cache-Control': 'no-cache'
        }
    })
        .then(response => response.json())
        .then(data => {
            

            // Don't check for cookies here - let the authentication flow handle this properly
            if (document.cookie) {
                
            }
        })
        .catch(error => {
            console.error("Headers debug error:", error);
        });

    // Add event listener for the Refresh Attendance button (ID is same)
    const refreshBtn = document.getElementById('refresh-attendance-btn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', function () {
            if (currentViewSessionId) {
                
                loadAttendanceRecords(currentViewSessionId); // Reload using the stored ID
            } else {
                
                // Optional: Show a small message to the user
                const recordsDiv = document.getElementById('attendance-records');
                if (recordsDiv && !recordsDiv.querySelector('table')) { // Only show if no records are displayed
                    recordsDiv.innerHTML = '<p class="info-message">Please select a class, date, and section first.</p>';
                }
            }
        });
    }

    // Add event listener for the Refresh Recent Attendance button (ID is same)
    const refreshRecentBtn = document.getElementById('refresh-recent-attendance-btn');
    if (refreshRecentBtn) {
        refreshRecentBtn.addEventListener('click', function () {
            
            loadRecentAttendanceRecords();
        });
    }

    // Add event listener for the Export CSV button (ID is same)
    const exportBtn = document.getElementById('export-attendance-btn');
    if (exportBtn) {
        exportBtn.addEventListener('click', async function () {
            if (!currentViewSessionId) {
                console.warn('Export clicked but no session selected');
                showError('Please select a session before exporting.');
                return;
            }
            try {
                const url = `${API_URL}/auth/attendance/export?sessionId=${currentViewSessionId}`;
                const response = await fetch(url, { credentials: 'include' });
                if (!response.ok) {
                    throw new Error(`Server responded with ${response.status}`);
                }
                const blob = await response.blob();
                const a = document.createElement('a');
                const blobUrl = URL.createObjectURL(blob);
                a.href = blobUrl;
                a.download = `attendance_${currentViewSessionId}.csv`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(blobUrl);
            } catch (err) {
                console.error('Error exporting CSV:', err);
                showError('Failed to export CSV. ' + err.message);
            }
        });
    }

    // Add click listener for logo refresh
    const logoLink = document.getElementById('logo-refresh-link');
    if (logoLink) {
        logoLink.addEventListener('click', function (e) {
            e.preventDefault(); // Prevent default anchor behavior
            
            location.reload(); // Reload the current page
        });
    }

    // --- NEW: Teacher Profile Modal Listeners ---
    const editProfileBtn = document.getElementById('edit-profile-btn');
    const teacherProfileModalOverlay = document.getElementById('teacher-profile-modal-overlay');
    const closeTeacherProfileBtn = document.getElementById('close-teacher-profile-modal-btn');
    const teacherProfileForm = document.getElementById('teacher-profile-form');

    if (editProfileBtn) {
        editProfileBtn.addEventListener('click', (e) => {
            e.preventDefault();
            showTeacherProfileModal();
        });
    }

    if (closeTeacherProfileBtn) {
        closeTeacherProfileBtn.addEventListener('click', () => {
            hideTeacherProfileModal();
        });
    }

    // Close modal if clicking outside the content area
    if (teacherProfileModalOverlay) {
        teacherProfileModalOverlay.addEventListener('click', (event) => {
            if (event.target === teacherProfileModalOverlay) { // Check if the click is on the overlay itself
                hideTeacherProfileModal();
            }
        });
    }

    if (teacherProfileForm) {
        teacherProfileForm.addEventListener('submit', handleTeacherProfileUpdate);
    }
    // --- END: Teacher Profile Modal Listeners ---

    // --- NEW: Teacher Dropdown Menu Logic ---
    const teacherMenuTrigger = document.getElementById('teacher-user-menu-trigger');
    const teacherMenuDropdown = document.getElementById('teacher-user-menu-dropdown');
    // Get profile button reference here as it's part of the dropdown - REMOVED duplicate declaration
    // const editProfileBtn = document.getElementById('edit-profile-btn'); 
    // console.log('DEBUG: Found Edit Profile Button?', editProfileBtn); // <-- Log 1 (Will use the later declaration)

    if (teacherMenuTrigger && teacherMenuDropdown) {
        teacherMenuTrigger.addEventListener('click', (event) => {
            event.stopPropagation(); // Prevent click from immediately closing menu
            teacherMenuDropdown.classList.toggle('visible');
        });

        // Close dropdown if clicking outside
        document.addEventListener('click', (event) => {
            if (!teacherMenuTrigger.contains(event.target) && !teacherMenuDropdown.contains(event.target)) {
                if (teacherMenuDropdown.classList.contains('visible')) {
                    teacherMenuDropdown.classList.remove('visible');
                }
            }
        });

        // Close dropdown when an item inside is clicked
        teacherMenuDropdown.querySelectorAll('.dropdown-item').forEach(item => {
            item.addEventListener('click', () => {
                 if (teacherMenuDropdown.classList.contains('visible')) {
                    teacherMenuDropdown.classList.remove('visible');
                }
            });
        });

    } else {
        console.warn('[Teacher Menu] Trigger or dropdown element not found.');
    }
    // --- END: Teacher Dropdown Menu Logic ---

    // --- Teacher Profile Modal Listeners (Variables already defined above) ---

    if (editProfileBtn) { // Use the variable defined earlier for the dropdown link
        console.log('DEBUG: Attaching click listener to Edit Profile Button'); // <-- Log 2
        editProfileBtn.addEventListener('click', (e) => {
            console.log('DEBUG: Edit Profile Button CLICKED'); // <-- Log 3
            e.preventDefault();
            showTeacherProfileModal();
        });
    }

    if (closeTeacherProfileBtn) { // Use the variable defined earlier
        closeTeacherProfileBtn.addEventListener('click', () => {
            hideTeacherProfileModal();
        });
    }

    // Close modal if clicking outside the content area
    if (teacherProfileModalOverlay) { // Use the variable defined earlier for the modal overlay
        teacherProfileModalOverlay.addEventListener('click', (event) => {
            if (event.target === teacherProfileModalOverlay) { // Check if the click is on the overlay itself
                hideTeacherProfileModal();
            }
        });
    }

    if (teacherProfileForm) { // Use the variable defined earlier
        teacherProfileForm.addEventListener('submit', handleTeacherProfileUpdate);
    }
    // --- END: Teacher Profile Modal Listeners ---

});

// Function to check authentication status
async function checkAuthStatus() {
    try {
        const response = await fetch(`${API_URL}/auth/check-auth`, {
            method: "GET",
            credentials: "include",
            headers: {
                "Accept": "application/json",
                "Cache-Control": "no-cache"
            }
        });

        if (!response.ok) return false;
                const data = await response.json();

        // Remove localStorage fallback entirely
        return data.authenticated && data.user?.role === 'teacher';

            } catch (error) {
        console.error("Auth check error:", error);
        return false;
    }
}

// Initialize dashboard
async function initDashboard() {
    
    // ... (code to get userId, userRole) ...
                const userId = sessionStorage.getItem('userId');
                const userRole = sessionStorage.getItem('userRole');
    // const teacherSection = document.getElementById('teacher-section'); // REMOVE reference to old container

    // No need to explicitly show a container, just load data
    if (userRole === 'teacher') {
        try {
            
            // Create promises for each independent data loading function
            const loadClassesPromise = loadClasses();
            const loadRecentAttendancePromise = loadRecentAttendanceRecords();
            const loadActiveSessionsPromise = loadActiveQrSessions();
            const loadStatsPromise = loadDashboardStats(); // <-- Add promise for stats
            // Calendar rendering is fast and depends on DOM, run after fetches

            // Wait for all essential data fetches to complete
            await Promise.all([
                loadClassesPromise, 
                loadRecentAttendancePromise, 
                loadActiveSessionsPromise,
                loadStatsPromise // <-- Wait for stats too
            ]);
            

            await renderCalendar(null, new Date(), true); // Pass null classId and initial flag


            } catch (error) {
            console.error("Error during dashboard initialization:", error);
        } finally {
            // Hide the loader once all initial loading is done or an error occurred
            const loader = document.getElementById('full-page-loader');
            if (loader) {
                loader.classList.add('hidden');
                
            }
        }

    } else if (userRole !== 'teacher') {
        console.warn('User is not a teacher. Functionality may be limited or redirect should occur.');
    }
}

// --- NEW: Function to load dashboard summary statistics ---
async function loadDashboardStats() {
  
    const totalClassesStatEl = document.querySelector('#dashboard .stats-cards .stat-card:nth-child(1) .stat-number');
    const totalSessionsStatEl = document.querySelector('#dashboard .stats-cards .stat-card:nth-child(2) .stat-number');
    const totalAttendeesStatEl = document.querySelector('#dashboard .stats-cards .stat-card:nth-child(3) .stat-number'); 
    const avgAttendanceStatEl = document.querySelector('#dashboard .stats-cards .stat-card:nth-child(4) .stat-number'); // Added selector for Avg Attendance
    

    if (!totalClassesStatEl || !totalSessionsStatEl || !totalAttendeesStatEl || !avgAttendanceStatEl) { // Check all elements
        console.warn("One or more dashboard stats elements not found.");
        return; // Exit if elements aren't present
    }

    // Set default/loading state
    totalClassesStatEl.textContent = '-';
    totalSessionsStatEl.textContent = '-';
    totalAttendeesStatEl.textContent = '-'; 
    avgAttendanceStatEl.textContent = '-'; // Set loading state for avg attendance

    try {
        const response = await fetchWithAuth('/auth/teacher-stats'); // Use the new endpoint
        if (!response.ok) {
            throw new Error(`API Error: ${response.status} ${response.statusText}`);
        }
        const data = await response.json();

        if (data.success && data.stats) {
            
            // Assuming backend provides totalClasses, otherwise remove or adjust
            totalClassesStatEl.textContent = data.stats.totalClasses ?? '0'; 
            totalSessionsStatEl.textContent = data.stats.totalSessions ?? '0';
            totalAttendeesStatEl.textContent = data.stats.totalAttendees ?? '0'; 
            avgAttendanceStatEl.textContent = data.stats.averageAttendance ?? '0'; // Update Avg Attendance

    } else {
            console.error("Failed to get valid stats data:", data.message);
            totalClassesStatEl.textContent = 'Err'; 
            totalSessionsStatEl.textContent = 'Err'; 
            totalAttendeesStatEl.textContent = 'Err'; 
            avgAttendanceStatEl.textContent = 'Err'; // Indicate API error
        }
    } catch (error) {
        console.error('Error loading dashboard stats:', error);
        if (totalClassesStatEl) totalClassesStatEl.textContent = 'Err'; 
        if (totalSessionsStatEl) totalSessionsStatEl.textContent = 'Err'; 
        if (totalAttendeesStatEl) totalAttendeesStatEl.textContent = 'Err'; 
        if (avgAttendanceStatEl) avgAttendanceStatEl.textContent = 'Err'; // Indicate fetch error
    }
}

// Load classes for the teacher (Dropdowns in QR/Class Mgmt AND Boxes in Attendance)
async function loadClasses() {
    try {
        // Target elements for dropdowns
        const classSelect = document.getElementById('class-select');
        const attendanceClassSelect = document.getElementById('attendance-class-select');
        // Target elements for Class Management list
        const classesContainer = document.getElementById('classes-container');
        // Target element for Attendance Subject Boxes
        const attendanceSubjectList = document.getElementById('attendance-subject-list');

        // Initial check for essential elements might need adjustment based on context
        if (!classSelect || !attendanceClassSelect || !classesContainer || !attendanceSubjectList) {
            console.warn("One or more required class display elements not found. Some features might be affected.");
            // Don't return here, try to populate what we can
        }

        const userId = sessionStorage.getItem('userId');

        // Prepare headers with auth information
        const headers = {
            'Accept': 'application/json',
            'Cache-Control': 'no-cache'
        };

        // Only add header auth if no valid cookie exists
        if (!document.cookie.includes('qr_attendance_sid')) {
            const userId = sessionStorage.getItem('userId');
            const userRole = sessionStorage.getItem('userRole');
            if (userId && userRole) {
                headers['X-User-ID'] = userId;
                headers['X-User-Role'] = userRole;
            }
        }

        // Try the authenticated endpoint with headers
        let response = await fetch(`${API_URL}/auth/teacher-classes/${userId}`, {
            credentials: 'include',
            headers: headers
        });



        // If unauthorized or error, retry with explicit header-based auth only
        if (response.status === 401 || response.status >= 500) {
      

            // Try again with explicit content type
            response = await fetch(`${API_URL}/auth/teacher-classes/${userId}`, {
                credentials: 'include',
                headers: {
                    'Accept': 'application/json',
                    'Cache-Control': 'no-cache',
                    'X-User-ID': userId,
                    'X-User-Role': userRole
                }
            });

       

            if (response.status === 401 || response.status >= 500) {
                console.error('Both authenticated and direct methods failed');
                if (classesContainer) { // Check if element exists before modifying
                classesContainer.innerHTML = `
                    <div class="empty-state error">
                        <p>Authentication failed. Please try logging in again.</p>
                        <button class="btn" id="reloginBtn">Login Again</button>
                    </div>
                `;
                document.getElementById('reloginBtn')?.addEventListener('click', () => {
                    logout();
                });
                }
                return;
            }
        } // Missing closing brace here
        
        const data = await response.json();
        
        // Clear existing options and lists
        if (classSelect) classSelect.innerHTML = '<option value="">-- Select a Class --</option>';
        if (attendanceClassSelect) attendanceClassSelect.innerHTML = '<option value="">-- Select a Class --</option>';
        if (classesContainer) classesContainer.innerHTML = ''; // Clear spinner/content
        if (attendanceSubjectList) attendanceSubjectList.innerHTML = ''; // Clear spinner/content
        
        if (data.success) {
            // Clear existing class list (including potential spinner)
            if (classesContainer) classesContainer.innerHTML = ''; // Ensure clear even if already cleared

            // RESTORED: Update total classes count using data from this endpoint
            const totalClassesStat = document.querySelector('#dashboard .stats-cards .stat-card:nth-child(1) .stat-number'); 
            if (totalClassesStat) {
                // Use data.count if available (from qrSystem route), otherwise fallback to array length
                totalClassesStat.textContent = data.count ?? data.classes?.length ?? 0;
            }
            
            // Also update summary card in #classes section
            const totalClassesValue = document.getElementById('total-classes-value');
            if (totalClassesValue) {
                // Use data.count or length here too for consistency
                totalClassesValue.textContent = data.count ?? data.classes?.length ?? 0;
            }
            
            if (data.classes && data.classes.length > 0) {
                // Add classes to selects and class list
                data.classes.forEach(cls => {
                    // Add to class select for QR generation
                    if (classSelect) {
                    const option = document.createElement('option');
                    option.value = cls.id;
                    option.textContent = cls.class_name || cls.name;
                    classSelect.appendChild(option);
                    }
                    
                    // Add to attendance class select (OLD - Keep for now if needed elsewhere, remove later if unused)
                    if (attendanceClassSelect) {
                    const attOption = document.createElement('option');
                    attOption.value = cls.id;
                    attOption.textContent = cls.class_name || cls.name;
                    attendanceClassSelect.appendChild(attOption);
                    }
                    
                    // Add to Class Management list
                    if (classesContainer) {
                    const classItem = document.createElement('div');
                        classItem.className = 'class-card'; // Use the new class name
                    classItem.innerHTML = `
                            <div class="class-badge">${cls.class_name || cls.name}</div> 
                            <div class="class-details">
                                <h4>${cls.subject || 'N/A'}</h4>
                                <p>${cls.description || 'No description'}</p>
                        </div>
                            <button class="delete-btn" data-id="${cls.id}"><i class="fas fa-trash-alt"></i></button> 
                        `; // Use the new delete button class and structure
                    classesContainer.appendChild(classItem);
                    }

                    // Add to Attendance Subject List
                    if (attendanceSubjectList) {
                        const subjectBox = document.createElement('div');
                        subjectBox.className = 'selector-box';
                        subjectBox.textContent = cls.class_name || cls.name; // Display class name/code
                        subjectBox.dataset.classId = cls.id; // Store class ID
                        subjectBox.addEventListener('click', handleSubjectBoxClick);
                        attendanceSubjectList.appendChild(subjectBox);
                    }
                });

                // Add event listeners to delete buttons (using the new class '.delete-btn')
                // Ensure this runs only once by checking a flag or attaching to a parent
                if (classesContainer && !classesContainer.dataset.deleteListenersAttached) {
                     classesContainer.addEventListener('click', async function(event) {
                        if (event.target.closest('.delete-btn')) {
                            const button = event.target.closest('.delete-btn');
                            const classId = button.getAttribute('data-id');
                        if (confirm('Are you sure you want to delete this class?')) {
                                await deleteClass(classId, button);
                            }
                        }
                    });
                    classesContainer.dataset.deleteListenersAttached = 'true';
                }
            } else {
                if (classesContainer) {
                classesContainer.innerHTML = `
                    <div class="empty-state">
                        <p>You haven't created any classes yet.</p>
                        <p>Add your first class using the Add Class Form.</p>
                    </div>
                `;
                }
                if (attendanceSubjectList) {
                    attendanceSubjectList.innerHTML = "<p class=\"placeholder-text\">No subjects found. Add classes in the 'Classes' section.</p>";
                }
            }
        } else {
            if (classesContainer) {
            classesContainer.innerHTML = `
                <div class="empty-state error">
                    <p>Failed to load classes: ${data.message || 'Unknown error'}</p>
                    <p>Please try again or contact support.</p>
                </div>
            `;
            }
            if (attendanceSubjectList) {
                attendanceSubjectList.innerHTML = '<p class="placeholder-text error">Failed to load subjects.</p>';
            }
        }
    } catch (error) {
        console.error('Error loading classes:', error);
        const classesContainer = document.getElementById('classes-container'); // Re-get in catch block
        if (classesContainer) {
            classesContainer.innerHTML = `
            <div class="empty-state error">
                <p>Error loading classes: ${error.message}</p>
                <p>Please check your connection and try again.</p>
            </div>
        `;
        }
        // Also update dropdowns/other lists on error if needed
        const classSelect = document.getElementById('class-select');
        const attendanceClassSelect = document.getElementById('attendance-class-select');
        const attendanceSubjectList = document.getElementById('attendance-subject-list');
        if (classSelect) classSelect.innerHTML = '<option value="">Error loading</option>';
        if (attendanceClassSelect) attendanceClassSelect.innerHTML = '<option value="">Error loading</option>';
        if (attendanceSubjectList) attendanceSubjectList.innerHTML = '<p class="placeholder-text error">Error loading subjects.</p>';
    }
}

// Add a new class
async function addNewClass() {
    const className = document.getElementById('class-name').value.trim();
    const classSubject = document.getElementById('subject').value.trim();
    const classDescription = document.getElementById('description').value.trim();
    // Modal elements
    const modalOverlay = document.getElementById('status-modal-overlay');
    const modalIconContainer = document.getElementById('status-modal-icon-container');
    const modalMessage = document.getElementById('status-modal-message');
    const addClassButton = document.getElementById('add-class-btn'); // Get button to disable/enable

    // Basic validation before showing modal
    if (!className || !classSubject) {
        alert('Please enter both Class Name and Subject.'); // Simple alert for now
        return;
    }
    
    // --- Show Loading Modal ---
    modalIconContainer.innerHTML = '<div class="loading-spinner"></div>'; // Use correct spinner class
    modalMessage.textContent = 'Adding class...';
    modalOverlay.classList.add('visible');
    addClassButton.disabled = true;
    // --- End Show Loading Modal ---

    try {
        const response = await fetch(`${API_URL}/auth/classes`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify({
                name: className,
                subject: classSubject,
                description: classDescription
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            // --- Show Success Modal ---
            modalIconContainer.innerHTML = '<span class="status-icon success">✅</span>'; // Use simple emoji or FA icon if available
            modalMessage.textContent = 'Class added successfully!';
            // --- End Show Success Modal ---
            document.getElementById('class-name').value = '';
            document.getElementById('subject').value = '';
            document.getElementById('description').value = '';
            await loadClasses(); // Reload classes
        } else {
            // --- Show Error Modal ---
            modalIconContainer.innerHTML = '<span class="status-icon error">❌</span>';
            modalMessage.textContent = `Error: ${data.message}`;
            // --- End Show Error Modal ---
        }
    } catch (error) {
        console.error('Error adding class:', error);
        // --- Show Network Error Modal ---
        modalIconContainer.innerHTML = '<span class="status-icon error">❌</span>';
        modalMessage.textContent = 'Server error. Please try again.';
        // --- End Show Network Error Modal ---
    } finally {
        // --- Hide Modal After Delay & Re-enable Button ---
        setTimeout(() => {
            modalOverlay.classList.remove('visible');
        }, 1800); // Keep modal visible for 1.8 seconds
        addClassButton.disabled = false;
        // --- End Hide Modal & Re-enable ---
    }
}

// Delete a class
async function deleteClass(classId, deleteButtonElement) {
    // Modal elements
    const modalOverlay = document.getElementById('status-modal-overlay');
    const modalIconContainer = document.getElementById('status-modal-icon-container');
    const modalMessage = document.getElementById('status-modal-message');

    if (!modalOverlay || !modalIconContainer || !modalMessage) {
        console.error("Status modal elements not found for delete action!");
        alert("Error: Cannot show status. UI elements missing."); // Fallback alert
        return;
    }

    // --- Show Loading Modal ---
    modalIconContainer.innerHTML = '<div class="loading-spinner"></div>';
    modalMessage.textContent = 'Deleting class...';
    modalOverlay.classList.add('visible');
    if (deleteButtonElement) deleteButtonElement.disabled = true; // Disable the specific button
    // --- End Show Loading Modal ---

    try {
        const response = await fetch(`${API_URL}/auth/classes/${classId}`, {
            method: 'DELETE',
            credentials: 'include'
        });
        
        const data = await response.json();
        
        if (data.success) {
            // --- Show Success Modal ---
            modalIconContainer.innerHTML = '<span class="status-icon success">✅</span>';
            modalMessage.textContent = 'Class deleted successfully!';
            // --- End Show Success Modal ---
            await loadClasses(); // Reload classes
        } else {
            // --- Show Error Modal ---
            modalIconContainer.innerHTML = '<span class="status-icon error">❌</span>';
            modalMessage.textContent = `Error: ${data.message}`;
            // --- End Show Error Modal ---
        }
    } catch (error) {
        console.error('Error deleting class:', error);
        // --- Show Network Error Modal ---
        modalIconContainer.innerHTML = '<span class="status-icon error">❌</span>';
        modalMessage.textContent = 'Server error. Please try again.';
        // --- End Show Network Error Modal ---
    } finally {
        // --- Hide Modal After Delay & Re-enable Button (if it still exists) ---
        setTimeout(() => {
            modalOverlay.classList.remove('visible');
        }, 1500); // Keep modal visible for 1.5 seconds
        if (deleteButtonElement && document.body.contains(deleteButtonElement)) { // Check if button still in DOM
            deleteButtonElement.disabled = false;
        }
        // --- End Hide Modal & Re-enable ---
    }
}

// Load sessions (now distinct dates) for a class
async function loadSessions(classId) {
    const sessionSelect = document.getElementById('session-select');
    const sectionChoicesDiv = document.getElementById('section-choices');
    const sectionButtonsContainer = document.getElementById('section-buttons-container');
    const recordsDiv = document.getElementById('attendance-records');

    // --- Show Loading State for Dates --- 
    sessionSelect.innerHTML = '<option value="" disabled selected>Loading dates...</option>';
    sessionSelect.disabled = true;
    if (sectionButtonsContainer) sectionButtonsContainer.innerHTML = ''; // Clear previous sections
    if (sectionChoicesDiv) sectionChoicesDiv.style.display = 'none'; // Hide section choices
    if (recordsDiv) recordsDiv.innerHTML = ''; // Clear previous records
    // --- End Loading State ---
    
    if (!classId) {
        sessionSelect.innerHTML = '<option disabled selected>Please select a class first</option>';
        // Keep disabled
        return;
    }
    
    try {
        

        // Prepare headers with existing auth info
        const headers = {
            'Accept': 'application/json',
            'Cache-Control': 'no-cache'
        };

        // Only add header auth if no valid cookie exists
        if (!document.cookie.includes('qr_attendance_sid')) {
            const userId = sessionStorage.getItem('userId');
            const userRole = sessionStorage.getItem('userRole');
            if (userId && userRole) {
                headers['X-User-ID'] = userId;
                headers['X-User-Role'] = userRole;
            }
        }
        
        const response = await fetch(`${API_URL}/auth/class-sessions/${classId}`, {
            method: 'GET',
            credentials: 'include',
            headers: headers
        });

        // Handle Unauthorized error specifically
        if (response.status === 401) {
            console.error('Authentication failed when loading sessions');
            sessionSelect.innerHTML += '<option disabled>Authentication failed. Please try logging in again.</option>';
            return;
        }
        
        if (!response.ok) {
            throw new Error(`Server returned ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        

        // --- Populate Dates or Show No Dates --- 
        sessionSelect.innerHTML = '<option value="" disabled selected>Select date</option>'; // Reset placeholder
        if (data.success && data.dates && data.dates.length > 0) {
            data.dates.forEach(dateStr => { // Iterate through date strings
                const option = document.createElement('option');
                option.value = dateStr; // Value is the YYYY-MM-DD date string

                // Format date for display (e.g., "Apr 5, 2025")
                let displayDate = 'Unknown Date';
                try {
                    const dateObj = new Date(dateStr + 'T00:00:00'); // Add time to parse correctly
                    if (!isNaN(dateObj.getTime())) {
                        displayDate = dateObj.toLocaleDateString('en-US', {
                                year: 'numeric',
                            month: 'long', // Use 'long' for full month name
                            day: 'numeric'
                        });
                    }
                } catch (e) { console.error("Error parsing date for display:", e); }

                // Set option text
                option.textContent = `Session - ${displayDate}`;
                // Keep the YYYY-MM-DD date in the data attribute for the next step
                option.setAttribute('data-session-date', dateStr);
                sessionSelect.appendChild(option);
            });

            
        } else {
            sessionSelect.innerHTML += '<option disabled>No session dates found</option>';
        }
    } catch (error) {
        console.error('Error loading distinct session dates:', error);
        sessionSelect.innerHTML = '<option value="" disabled selected>Error loading dates</option>'; // Show error state
        sessionSelect.innerHTML += `<option disabled>Error: ${error.message}</option>`;
    } finally {
        // --- Re-enable Dropdown --- 
        sessionSelect.disabled = false;
        // --- End Re-enable ---
    }
}

// Load attendance records for a session
async function loadAttendanceRecords(specificSessionId = null) {
    // --- STOP PREVIOUS POLLING for this specific view --- 
    if (viewAttendanceIntervalId) {
        clearInterval(viewAttendanceIntervalId);
        viewAttendanceIntervalId = null;
        
    }
    // --- END STOP POLLING ---

    // Use the provided sessionId if available, otherwise try to get from button/context if needed
    const sessionId = specificSessionId;
    const recordsDiv = document.getElementById('attendance-records');

    // --- Show Loading State for Records --- 
    // Clear previous content and show loading message immediately
    if (recordsDiv) {
        recordsDiv.innerHTML = '<p class="loading-indicator">Loading attendance records...</p>';
    } else {
        console.error("Attendance records div not found!");
        return; // Cannot proceed without the container
    }
    // --- End Loading State ---
    
    if (!sessionId) {
        recordsDiv.innerHTML = '<div class="error-message">Please select a class, date, and section.</div>';
        return;
    }
    
    try {
        // Include both cookie-based and header-based auth
        const headers = {
            'Accept': 'application/json',
            'Cache-Control': 'no-cache'
        };

        // Add fallback header auth
        const userId = sessionStorage.getItem('userId');
        const userRole = sessionStorage.getItem('userRole');
        if (userId && userRole) {
            headers['X-User-ID'] = userId;
            headers['X-User-Role'] = userRole;
        }
        
        const response = await fetch(`${API_URL}/teacher/attendance/${sessionId}`, {
            method: 'GET',
            credentials: 'include',
            headers: headers
        });

        // Handle Unauthorized error specifically
        if (response.status === 401) {
            console.error('Authentication failed when loading attendance records');
            recordsDiv.innerHTML = '<div class="error-message">Authentication failed. Please try logging in again.</div>';
            return;
        }
        
        if (!response.ok) {
            throw new Error(`Server returned ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        
        if (data.success) {
            if (!data.attendanceRecords || data.attendanceRecords.length === 0) {
                recordsDiv.innerHTML = '<p class="empty-message">No attendance records found for this session.</p>';
                return;
            }

            // Get section information to display (if available)
            const sectionInfo = data.section ? `<p class="session-section">Section: ${data.section}</p>` : ''; // You might need CSS for .session-section
            
            // Create attendance table - Use new CSS classes
            let tableHTML = `
                <div class="attendance-header">
                    <h3>${data.className || 'Unknown Class'}</h3>
                    <p>Subject: ${data.subject || 'Unknown Subject'}</p>
                    ${sectionInfo}
                </div>
                <div class="table-container"> 
                    <table class="records-table"> 
                    <thead>
                        <tr>
                            <th>Student ID</th>
                            <th>Student Name</th>
                            <th>Date & Time</th>
                        </tr>
                    </thead>
                    <tbody>
            `;
            
            data.attendanceRecords.forEach(record => {
                // Format time safely with error handling for UTC+8 time
                let timeDisplay = 'Unknown Time';
                try {
                    if (record.timestamp) {
                        // The server is already providing UTC+8 time, so we can parse directly
                        const recordTime = new Date(record.timestamp);
                        if (!isNaN(recordTime.getTime())) {
                            // Format with date and time for complete information
                            timeDisplay = recordTime.toLocaleString('en-US', {
                                year: 'numeric',
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                                second: '2-digit',
                                hour12: true
                            });
                        }
                    }
                } catch (timeError) {
                    console.error('Error formatting time:', timeError, record);
                }
                
                tableHTML += `
                    <tr>
                        <td>${record.student_number || record.student_id || 'Unknown'}</td>
                        <td>${record.student_name || 'Unknown'}</td>
                        <td>${timeDisplay}</td>
                    </tr>
                `;
            });
            
            tableHTML += `
                    </tbody>
                </table>
                </div> 
            `;
            
            recordsDiv.innerHTML = tableHTML;

            // --- Show the Export Button --- 
            const exportBtn = document.getElementById('export-attendance-btn');
            if (exportBtn) {
                exportBtn.style.display = 'inline-flex'; // Use inline-flex to align icon and text properly
            }
            // --- End Show Export Button ---



        } else {
            recordsDiv.innerHTML = `<div class="error-message">Error: ${data.message || 'Failed to load attendance records'}</div>`;
            // Stop polling if there was an API error (Keep this clearInterval)
            if (viewAttendanceIntervalId) {
                clearInterval(viewAttendanceIntervalId);
                viewAttendanceIntervalId = null;
                
            }
        }
    } catch (error) {
        console.error('Error loading attendance records:', error);
        recordsDiv.innerHTML = `<div class="error-message">Server error: ${error.message}. Please try again.</div>`;
        // Stop polling if there was a network/fetch error (Keep this clearInterval)
        if (viewAttendanceIntervalId) {
            clearInterval(viewAttendanceIntervalId);
            viewAttendanceIntervalId = null;
            
        }
    }
}

// REMOVED: viewCurrentSessionAttendance function as button doesn't exist
// async function viewCurrentSessionAttendance() { ... }

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
        modalIconContainer.innerHTML = '<div class="loading-spinner"></div>'; // Use new class if defined in new CSS
        modalMessage.textContent = 'Logging out...';
        modalOverlay.classList.add('visible');
        if (logoutButtonElement) logoutButtonElement.disabled = true;
        // --- End Show Loading Modal ---
    }

    
    // Stop recent attendance polling
    if (recentAttendanceIntervalId) {
        clearInterval(recentAttendanceIntervalId);
       
        recentAttendanceIntervalId = null;
    }
    // Stop specific view attendance polling
    if (viewAttendanceIntervalId) {
        clearInterval(viewAttendanceIntervalId);
      
        viewAttendanceIntervalId = null;
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

// Function to load recent attendance records
async function loadRecentAttendanceRecords() {
    const tableBody = document.querySelector('#recent-attendance-table tbody');
    if (!tableBody) return;

    // Show loading state
    tableBody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 2rem;"><div class="loading-spinner"></div></td></tr>`;

    try {
        const teacherId = sessionStorage.getItem('userId');
        if (!teacherId) {
            console.error('Teacher ID not found in session storage');
            return;
        }

        // Prepare headers with auth information
        const headers = {
            'Accept': 'application/json',
            'Cache-Control': 'no-cache'
        };

        // Add fallback header auth
        const userId = sessionStorage.getItem('userId');
        const userRole = sessionStorage.getItem('userRole');
        if (userId && userRole) {
            headers['X-User-ID'] = userId;
            headers['X-User-Role'] = userRole;
        }

        // Updated endpoint to match the backend route pattern
        const response = await fetch(`${API_URL}/auth/recent-attendance-summary`, {
            method: 'GET',
            credentials: 'include',
            headers: headers
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch attendance records: ${response.status}`);
        }

        const data = await response.json();

        if (data.success && data.records && data.records.length > 0) {
            displayAttendanceRecords(data.records);
        } else {
            tableBody.innerHTML = '<tr><td colspan="5" style="text-align: center;">No attendance records found</td></tr>';
        }
    } catch (error) {
        console.error('Error fetching recent attendance records:', error);
        tableBody.innerHTML = `<tr><td colspan="5" style="text-align: center;">Error loading records: ${error.message}</td></tr>`;
    }
}

function displayAttendanceRecords(records) {
    const tableBody = document.querySelector('#recent-attendance-table tbody');
    if (!tableBody) return;

    tableBody.innerHTML = ''; // Clear previous records

    if (!records || records.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="5" style="text-align: center;">No attendance records found</td></tr>`;
        return;
    }

    records.forEach(record => {
        const row = document.createElement('tr');

        // Format date to be more readable
        const dateObj = new Date(record.attendance_date + 'T00:00:00'); // Ensure correct parsing
        const formattedDate = dateObj.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });

        // Use the time directly from the backend query
        const formattedTime = record.attendance_time || 'N/A';
        const sectionDisplay = record.section || 'N/A'; // Handle null sections

        // Determine badge class based on present count - USE NEW CLASSES if defined
        const presentCount = record.present_count;
        const badgeClass = presentCount > 0 ? 'status-badge success' : 'status-badge warning'; // Example using new classes
        const badgeHTML = `<span class="${badgeClass}">${presentCount}</span>`; // Always show the count

        row.innerHTML = `
            <td>${record.class_name}</td>
            <td>${sectionDisplay}</td>
            <td>${formattedDate}</td>
            <td>${formattedTime}</td>
            <td>${badgeHTML}</td>
        `;

        tableBody.appendChild(row);
    });
}

// 📌 NEW: Function to fetch and display active QR sessions
// Make it globally accessible
window.loadActiveQrSessions = async function () {
    const activeSessionsSection = document.getElementById('active-sessions-section');
    const tableBody = document.querySelector('#active-sessions-table tbody');
    if (!tableBody || !activeSessionsSection) return;

    tableBody.innerHTML = '<tr><td colspan="5" style="text-align: center;">Loading active sessions...</td></tr>'; // Show loading state

    try {
        // 
        const response = await fetchWithAuth(`/auth/active-sessions`); // Assuming fetchWithAuth handles auth correctly
        // 

        const data = await response.json();
        // 

        if (data.success && data.sessions && data.sessions.length > 0) {
            // 
            activeSessionsSection.style.display = 'block'; // Or remove this if it's always visible in the new layout
            tableBody.innerHTML = ''; // Clear loading state

            data.sessions.forEach(session => {
                const row = tableBody.insertRow();

                const expires = new Date(session.expires_at_iso); // Use ISO string
                const now = new Date();
                const isExpired = expires < now;
                const status = isExpired ? 'Expired' : 'Active';
                const statusClass = isExpired ? 'status-expired' : 'status-badge-active'; // Add active class

                // Format expiration time (example: HH:MM:SS on YYYY-MM-DD)
                const formattedExpires = expires.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) +
                    ' on ' + expires.toLocaleDateString();

                // Adapt button classes if needed based on new CSS
                row.innerHTML = `
                    <td>${session.class_name || session.subject || 'N/A'}</td>
                    <td>${session.section || 'N/A'}</td>
                    <td>${formattedExpires}</td>
                    <td><span class="${statusClass}">${status}</span></td>
                    <td>
                        <button class="action-btn show-qr-btn btn-primary">Show QR</button>
                        <button class="action-btn delete-btn btn-danger">Delete</button>
                    </td>
                `; // Keep classes generic or update to match new CSS

                // Store session data on buttons for easy access
                const showBtn = row.querySelector('.show-qr-btn');
                const deleteBtn = row.querySelector('.delete-btn');

                if (showBtn) {
                    showBtn.dataset.sessionId = session.session_id;
                    showBtn.dataset.qrCodeUrl = session.qrCodeUrl;
                    showBtn.dataset.expiresAtIso = session.expires_at_iso;
                    showBtn.dataset.section = session.section || ''; // Store section
                    showBtn.dataset.subject = session.subject || ''; // Store subject
                    showBtn.dataset.className = session.class_name || session.subject || 'N/A'; // Add class name
                    showBtn.addEventListener('click', handleShowActiveQr);
                }
                if (deleteBtn) {
                    deleteBtn.dataset.sessionId = session.session_id;
                    deleteBtn.addEventListener('click', handleDeleteActiveSession);
                }
            });
        } else if (data.success) {
            // 
            activeSessionsSection.style.display = 'block'; // Or remove
            // Update the table body to show a message
            tableBody.innerHTML = '<tr><td colspan="5" style="text-align: center;">No active sessions found.</td></tr>';
        } else { // if !data.success
            console.error(`[loadActiveQrSessions] API call failed: ${data.message}`);
            tableBody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: red;">Error loading sessions: ${data.message}</td></tr>`;
            activeSessionsSection.style.display = 'block'; // Or remove
        }
    } catch (error) {
        console.error('Error fetching active sessions:', error);
        tableBody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: red;">Network error loading active sessions.</td></tr>`;
        activeSessionsSection.style.display = 'block'; // Or remove
    }
}

// 📌 NEW: Handler for "Show QR" button click
function handleShowActiveQr(event) {
    const button = event.target;
    // Retrieve subject along with other data
    const { sessionId, qrCodeUrl, expiresAtIso, section, className, subject } = button.dataset; // Use className now added

    // We also need the original duration to calculate the progress bar correctly.
    // This isn't stored in the button dataset currently.
    console.warn("[handleShowActiveQr] Cannot determine original duration. Using default for progress bar.");
    let durationMinutes = 10; // Default to 10 mins if we can't parse

    
    // Pass subject to displayGeneratedQr
    displayGeneratedQr(qrCodeUrl, sessionId, expiresAtIso, section, className, subject, durationMinutes); // Use durationMinutes workaround

    // Scroll to the top or the display area for visibility
    const displayColumn = document.querySelector('.qr-preview'); // Target the new container class
    if (displayColumn) {
        displayColumn.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

// 📌 NEW: Handler for "Delete" button click
async function handleDeleteActiveSession(event) {
    const button = event.target;
    const sessionId = button.dataset.sessionId;

    if (!confirm(`Are you sure you want to delete session ${sessionId}? This will expire the QR code immediately.`)) {
        return;
    }

    // 
    button.textContent = 'Deleting...';
    button.disabled = true;

    try {
        // CORRECTED FETCH URL based on server.js routing
        const response = await fetchWithAuth(`/auth/sessions/${sessionId}`, { // Assuming fetchWithAuth exists and works
            method: 'DELETE'
        });
        const data = await response.json();

        if (data.success) {
            // Remove the row from the table
            
            // Re-find the specific button and row AFTER the await, using sessionId
            let tableBody = document.querySelector('#active-sessions-table tbody');
            const buttonInTable = tableBody ? tableBody.querySelector(`.delete-btn[data-session-id="${sessionId}"]`) : null;
            const rowToRemove = buttonInTable ? buttonInTable.closest('tr') : null;

            
            

            if (rowToRemove) {
                rowToRemove.remove();
            } else {
                console.warn(`DEBUG: Could not re-find row for session ${sessionId} to remove it from UI.`);
                // Optionally force a full reload of the list as a fallback
                // window.loadActiveQrSessions(); 
            }
            

            // --- Check if the deleted session was the one displayed --- 
            if (sessionId === currentlyDisplayedSessionId) {
                
                resetQrDisplayArea();
            }
            // --- End Check --- 

            // Check if table body is empty, if so hide section or show message
            if (tableBody && tableBody.rows.length === 0) {
                // Instead of hiding, show the empty state message
                tableBody.innerHTML = '<tr><td colspan="5" style="text-align: center;">No active sessions found.</td></tr>';
            }
            // Potentially clear the main QR display if it was showing this session
            // clearQrDisplay(); // Hypothetical function
        } else {
            alert(`Error deleting session: ${data.message}`);
            button.textContent = 'Delete';
            button.disabled = false;
        }
    } catch (error) {
        console.error('Error deleting session:', error);
        alert('Network error deleting session.');
        button.textContent = 'Delete';
        button.disabled = false;
    }
}

// Add utility function for formatting date if not already present
function formatDate(dateString) {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
}

// Ensure initDashboard is called on page load
// Make sure this isn't called twice if qrcode.js also calls it
if (!window.dashboardInitialized) {
    document.addEventListener('DOMContentLoaded', initDashboard);
    window.dashboardInitialized = true;
}

// Helper function to show error messages (if not already defined)
function showError(message) {
    console.error("Dashboard Error:", message);
    // You might want to display this in a dedicated error area on the page
    // const errorDiv = document.getElementById('dashboard-error-message');
    // if (errorDiv) { errorDiv.textContent = message; errorDiv.style.display = 'block'; }
}

// Generate QR Code
async function generateQRCode() {
    const classSelect = document.getElementById('class-select');
    const sectionInput = document.getElementById('qr-section-input');
    const durationInput = document.getElementById('duration-input'); // New input field
    // Get references to the new display area elements
    const qrDisplayArea = document.getElementById('qr-display-area');
    const qrPlaceholder = document.getElementById('qr-placeholder');
    const generatedQrDetails = document.getElementById('generated-qr-details');

    if (!qrDisplayArea || !qrPlaceholder || !generatedQrDetails) {
        console.error("generateQRCode: Required QR display elements not found!"); // Error source clarified
        alert("Error: Cannot display QR code. UI elements missing.");
        return;
    }

    // Clear previous error messages if any
    const existingError = qrDisplayArea.querySelector('.error-message');
    if (existingError) qrDisplayArea.removeChild(existingError);

    const classId = classSelect.value;
    const className = classSelect.options[classSelect.selectedIndex]?.text;
    const section = sectionInput.value.trim();
    const durationMinutesStr = durationInput.value.trim(); // New input value (string)
    const teacherId = sessionStorage.getItem('userId');
    
    // --- NEW: Validate Duration Input --- 
    const durationMinutes = parseInt(durationMinutesStr);
    if (isNaN(durationMinutes) || durationMinutes < 1 || durationMinutes > 60) {
        qrPlaceholder.style.display = 'none';
        generatedQrDetails.style.display = 'none';
        qrDisplayArea.insertAdjacentHTML('afterbegin', '<div class="error-message centered-text"><p>Please enter a valid duration between 1 and 60 minutes.</p></div>');
        // Highlight the input field
        durationInput.classList.add('input-error'); // Assuming you have an input-error class
        durationInput.focus();
        return; // Stop execution
    } else {
        // Remove error highlight if valid
        durationInput.classList.remove('input-error');
    }
    // --- END: Validate Duration Input ---

    if (!classId) {
        // Show error in the new display area
        qrPlaceholder.style.display = 'none';
        generatedQrDetails.style.display = 'none';
        qrDisplayArea.insertAdjacentHTML('afterbegin', '<div class="error-message centered-text"><p>Please select a class.</p></div>');
        return;
    }
    if (!teacherId) {
        qrPlaceholder.style.display = 'none';
        generatedQrDetails.style.display = 'none';
        qrDisplayArea.insertAdjacentHTML('afterbegin', '<div class="error-message centered-text"><p>Teacher ID not found. Please log in again.</p></div>');
        return;
    }

    // --- Show Loading State --- 
    qrPlaceholder.style.display = 'none';
    generatedQrDetails.style.display = 'none';
    // Remove previous loading state if exists
    const existingLoading = qrDisplayArea.querySelector('.loading-state');
    if (existingLoading) qrDisplayArea.removeChild(existingLoading);
    // Add new loading state
    qrDisplayArea.insertAdjacentHTML('afterbegin', '<div class="loading-state centered-text"><div class="loading-spinner"></div><p>Generating QR Code...</p></div>'); // Use new spinner class if defined
    // --- End Loading State --- 

    try {
        // Prepare headers with auth information
        const headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/json' // Expect JSON back
        };

        // Fallback header auth (if needed)
        if (!document.cookie.includes('qr_attendance_sid')) {
            const userId = sessionStorage.getItem('userId');
            const userRole = sessionStorage.getItem('userRole');
            if (userId && userRole) {
                headers['X-User-ID'] = userId;
                headers['X-User-Role'] = userRole;
            }
        }

        const response = await fetch(`${API_URL}/auth/generate-qr`, {
            method: 'POST',
            credentials: 'include',
            headers: headers,
            body: JSON.stringify({
                class_id: classId,
                subject: className, // Send class name as subject
                teacher_id: teacherId,
                section: section || null, // Send section or null
                duration: durationMinutes // Use the parsed integer value
            })
        });
        
        const data = await response.json();

        // --- Remove Loading State --- 
        const currentLoading = qrDisplayArea.querySelector('.loading-state');
        if (currentLoading) qrDisplayArea.removeChild(currentLoading);
        // --- End Remove Loading State --- 
        
        if (data.success) {
            
            // Store current session ID for viewing attendance
            sessionStorage.setItem('currentQrSessionId', data.sessionId);

            // NEW: Display the generated QR in the new structure
            // Pass className as is (which includes the subject) and null for explicit subject.
            // displayGeneratedQr will parse the combined className.
            displayGeneratedQr(data.qrCodeUrl, data.sessionId, data.expiresAt, section, className, null, durationMinutes);

            // --- Refresh the active sessions list and dashboard stats --- 
            if (typeof window.loadActiveQrSessions === 'function') {
                window.loadActiveQrSessions();
        } else {
                console.warn("loadActiveQrSessions function not found, cannot refresh list.");
            }
            
            // Refresh dashboard stats to update total sessions count
            loadDashboardStats().catch(err => {
                console.warn("Failed to refresh dashboard stats:", err);
            });

            // --- NEW: Refresh Recent Attendance Records ---
            loadRecentAttendanceRecords().catch(err => {
                console.warn("Failed to refresh recent attendance records after QR generation:", err);
            });
            // --- END NEW: Refresh Recent Attendance Records ---

        } else {
            console.error("QR Code generation failed:", data.message);
            // Show error in display area
            qrPlaceholder.style.display = 'none'; // Keep placeholder hidden
            generatedQrDetails.style.display = 'none'; // Keep details hidden
            qrDisplayArea.insertAdjacentHTML('afterbegin', `<div class="error-message centered-text"><p>Failed to generate QR code: ${data.message}</p></div>`);
        }
    } catch (error) {
        console.error('Error generating QR code:', error);
        // --- Remove Loading State on Error --- 
        const currentLoadingOnError = qrDisplayArea.querySelector('.loading-state');
        if (currentLoadingOnError) qrDisplayArea.removeChild(currentLoadingOnError);
        // --- End Remove Loading State --- 
        qrPlaceholder.style.display = 'none'; // Keep placeholder hidden
        generatedQrDetails.style.display = 'none'; // Keep details hidden
        qrDisplayArea.insertAdjacentHTML('afterbegin', `<div class="error-message centered-text"><p>Error generating QR code: ${error.message}. Please check the connection.</p></div>`);
    }
}

// NEW: Function to display the generated QR code details in the right column
// Add subject parameter
function displayGeneratedQr(qrCodeUrl, sessionId, expiresAtIso, section, className, subject, durationMinutes) {
    const qrDisplayArea = document.getElementById('qr-display-area');
    const qrPlaceholder = document.getElementById('qr-placeholder');
    const generatedQrDetails = document.getElementById('generated-qr-details');

    // *** Added check for the main containers first ***
    if (!qrDisplayArea || !qrPlaceholder || !generatedQrDetails) {
        console.error("displayGeneratedQr: Main display area, placeholder, or details container not found!");
        // Attempt to show a basic error directly on the main content if possible, as qrDisplayArea might be the issue
        const mainContent = document.querySelector('.main-content');
        if (mainContent) mainContent.insertAdjacentHTML('afterbegin', '<div class="error-message centered-text" style="padding: 20px; border: 1px solid red;">Error: Core display containers missing.</div>');
        return;
    }

    // Get elements within the details container
    const qrCodeWrapper = document.getElementById('qr-code-image-wrapper');
    const qrInfoDiv = document.getElementById('qr-info');
    const expiresTextSpan = document.getElementById('expires-text');
    const progressBar = document.getElementById('progress-bar');
    const downloadBtn = document.getElementById('download-qr-btn');

    // *** Updated check to include ALL required inner elements ***
    if (!qrCodeWrapper || !qrInfoDiv || !expiresTextSpan || !progressBar || !downloadBtn) {
        console.error("displayGeneratedQr: One or more INNER elements (wrapper, info, timer, progress, buttons) not found!");
        // Show error within the display area, ensuring other elements are hidden
        qrPlaceholder.style.display = 'none';
        generatedQrDetails.style.display = 'none';
        // Clear previous errors/content before adding new one
        const existingContent = qrDisplayArea.querySelector('.error-message, .loading-state');
        if (existingContent) qrDisplayArea.removeChild(existingContent);
        qrDisplayArea.insertAdjacentHTML('afterbegin', '<div class="error-message centered-text"><p>Error displaying QR details. Inner UI elements missing.</p></div>');
        return;
    }

    // Clear display area content (remove loading state or previous error)
    const existingLoadingOrError = qrDisplayArea.querySelector('.loading-state, .error-message');
    if (existingLoadingOrError) qrDisplayArea.removeChild(existingLoadingOrError);

    // --- Render QR Code --- 
    qrCodeWrapper.innerHTML = ''; // Clear previous QR

    // Use the included qrcode.min.js library
    try {
        new QRCode(qrCodeWrapper, {
            text: qrCodeUrl, // The URL data for the QR code
            width: 200,     // Match the size used previously
            height: 200,
            colorDark: "#000000",
            colorLight: "#ffffff",
            correctLevel: QRCode.CorrectLevel.H // High correction level
        });
        
    } catch (error) {
        console.error("Failed to generate QR code using qrcode.js:", error);
        qrCodeWrapper.innerHTML = '<p class="error-message">Failed to generate QR code.</p>';
    }
    // --- End Render QR Code ---

    // --- Populate Info --- 
    const sectionDisplay = section ? ` - ${section}` : '';
    // Revised logic: Always try to parse className first.
    let cleanClassName = className;
    let displaySubject = ''; // Start with empty subject

    // Check if className seems to contain the subject
    if (className && className.includes('(') && className.includes(')')) {
        cleanClassName = className.substring(0, className.indexOf('(')).trim();
        displaySubject = className.substring(className.indexOf('(') + 1, className.indexOf(')'));
    } else {
        // If className didn't contain subject, use the passed subject (if any)
        displaySubject = subject; 
    }

    // Final check to prevent duplication like "PL101 (PL101 (...))"
    let combinedText = cleanClassName;
    if (displaySubject) {
        // If displaySubject already starts with the cleanClassName, just use displaySubject content
        // We add the parentheses back here for consistency if they were part of displaySubject
        if (displaySubject.trim().startsWith(cleanClassName)) {
            combinedText = displaySubject.includes('(') ? displaySubject : `${cleanClassName} (${displaySubject})`; // Keep original structure if subject had parens
        } else {
            // Otherwise, combine them
            combinedText += ` (${displaySubject})`;
        }
    }

    const subjectText = displaySubject ? ` (${displaySubject})` : '';
    qrInfoDiv.textContent = `Class: ${combinedText}${sectionDisplay}`;
    // --- End Populate Info ---

    // --- Timer and Progress Bar --- 
    if (generatedQrTimerIntervalId) {
        clearInterval(generatedQrTimerIntervalId);
    }
    const expires = new Date(expiresAtIso);
    const totalDurationMs = durationMinutes * 60 * 1000;
    function updateTimerAndProgress() {
        const now = new Date();
        const diffMs = expires.getTime() - now.getTime();

        if (diffMs <= 0) {
            clearInterval(generatedQrTimerIntervalId);
            generatedQrTimerIntervalId = null;
            expiresTextSpan.textContent = "Expired";
            progressBar.style.width = "0%";
            progressBar.classList.add('expired');
            // Disable buttons when expired?
            downloadBtn.disabled = true;
            return;
        }
        const minutes = Math.floor(diffMs / (1000 * 60));
        const seconds = Math.floor((diffMs % (1000 * 60)) / 1000);
        expiresTextSpan.textContent = `Expires in: ${minutes}m ${String(seconds).padStart(2, '0')}s`;

        const progressPercent = Math.max(0, (diffMs / totalDurationMs) * 100);
        progressBar.style.width = `${progressPercent}%`;
        progressBar.classList.remove('expired');

        // Re-enable buttons if they were disabled
        downloadBtn.disabled = false;
    }
    updateTimerAndProgress(); // Call immediately
    generatedQrTimerIntervalId = setInterval(updateTimerAndProgress, 1000);
    // --- End Timer and Progress Bar ---

    // --- Button Actions --- 
    downloadBtn.onclick = () => {
        // Find the generated image or canvas within the wrapper
        const qrImage = qrCodeWrapper.querySelector('img');
        const qrCanvas = qrCodeWrapper.querySelector('canvas');
        let downloadUrl = null;

        if (qrImage) {
            downloadUrl = qrImage.src; // PNG data URL from library
        } else if (qrCanvas) {
            try {
                downloadUrl = qrCanvas.toDataURL('image/png'); // Generate PNG from canvas
            } catch (e) {
                console.error("Could not get data URL from canvas:", e);
                alert("Failed to prepare QR code for download.");
                return;
            }
        } else {
            alert("Could not find generated QR code image to download.");
            return;
        }

        // Create a temporary link to trigger download
        const link = document.createElement('a');
        link.href = downloadUrl;
        link.download = `EazyAttend-QR-${className.replace(/\s+/g, '_')}-${sessionId.substring(0, 6)}.png`; // More descriptive filename
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    // --- End Button Actions ---

    // Make the details visible
    qrPlaceholder.style.display = 'none';
    generatedQrDetails.style.display = 'block';

    // Store the ID of the currently displayed session
    currentlyDisplayedSessionId = sessionId;
}

// NEW: Function to reset the QR display area to placeholder
function resetQrDisplayArea() {
    const qrDisplayArea = document.getElementById('qr-display-area');
    const qrPlaceholder = document.getElementById('qr-placeholder');
    const generatedQrDetails = document.getElementById('generated-qr-details');

    if (qrPlaceholder && generatedQrDetails) {
        generatedQrDetails.style.display = 'none';
        qrPlaceholder.style.display = 'block';
    }

    // Clear the timer interval if it exists
    if (generatedQrTimerIntervalId) {
        clearInterval(generatedQrTimerIntervalId);
    }

    // Reset the tracking variable
    currentlyDisplayedSessionId = null;
}

// --- NEW Helper: Fetch with Auth (Example - Adjust based on your actual auth) ---
async function fetchWithAuth(url, options = {}) {
    const headers = {
        ...(options.headers || {}), // Keep existing headers
        'Accept': 'application/json',
        'Cache-Control': 'no-cache'
    };

    // --- Start Debug Logging ---
    // Construct the full URL correctly using API_URL from config.js and the relative URL passed in
    const requestUrl = `${API_URL}${url}`;
    
    const cookieExists = document.cookie.includes('qr_attendance_sid');
    
    // --- End Debug Logging ---

    // ALWAYS attempt to add fallback header auth if user info is in sessionStorage
    
    const userId = sessionStorage.getItem('userId');
    const userRole = sessionStorage.getItem('userRole');
    
    if (userId && userRole) {
        headers['X-User-ID'] = userId;
        headers['X-User-Role'] = userRole;
        
    } else {
        console.warn(`[fetchWithAuth] Could not add auth headers: userId or userRole missing from sessionStorage.`);
    }

    const response = await fetch(requestUrl, { // Use the constructed requestUrl
        ...options, // Keep existing options (method, body, etc.)
        credentials: 'include',
        headers: headers
    });

    // Handle 401 Unauthorized responses properly
    if (response.status === 401) {
        console.error(`Authentication error for URL: ${url}`);
        
        // Clear session data
        sessionStorage.clear();
        
        // Show the session expired modal
        const modalOverlay = document.getElementById('status-modal-overlay');
        const modalIconContainer = document.getElementById('status-modal-icon-container');
        const modalMessage = document.getElementById('status-modal-message');
        const modalCloseBtn = document.getElementById('close-status-modal-btn');
        
        if (modalOverlay && modalIconContainer && modalMessage) {
            console.log("[fetchWithAuth] >>> Showing 'Session Expired' modal...");
            modalIconContainer.innerHTML = '<span class="status-icon warning">⚠️</span>'; 
            modalMessage.textContent = "Session expired. Please log in again.";
            
            // Hide close button if it exists
            if (modalCloseBtn) modalCloseBtn.style.display = 'none';
            
            modalOverlay.classList.add('visible');
            
            // Redirect after a delay
            console.log("[fetchWithAuth] >>> Setting redirect timer to login page...");
            setTimeout(() => {
                console.log("[fetchWithAuth] >>> Executing redirect now.");
                window.location.href = getBasePath() + '/pages/login.html';
            }, 3000);
        } else {
            // If modal elements not found, redirect immediately
            console.error("[fetchWithAuth] >>> Could not find status modal elements. Redirecting to login page immediately.");
            window.location.href = getBasePath() + '/pages/login.html';
        }
    }

    return response; // Return the raw response for the caller to handle .json(), etc.
}

// --- New Attendance View Handlers ---

// Helper function to format Date object to YYYY-MM-DD string
function formatDateToYYYYMMDD(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0'); // Months are 0-indexed
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// Handler for clicking a subject box
async function handleSubjectBoxClick(event) {
    const selectedBox = event.target;
    const classId = selectedBox.dataset.classId;
    currentSelectedClassId = classId; // Store for calendar nav

    

    // Visually mark selected subject
    document.querySelectorAll('#attendance-subject-list .selector-box').forEach(box => box.classList.remove('selected'));
    selectedBox.classList.add('selected');

    // Reset subsequent containers
    const calendarContainer = document.getElementById('calendar-container');
    const calendarPlaceholder = document.getElementById('calendar-placeholder');
    const calendarHeader = document.getElementById('calendar-header');
    const calendarWeekdays = document.getElementById('calendar-weekdays');
    const calendarDays = document.getElementById('calendar-days');
    const sectionList = document.getElementById('attendance-section-list');
    const recordsDiv = document.getElementById('attendance-records');
    const exportBtn = document.getElementById('export-attendance-btn');

    // Hide placeholder, show calendar parts (initially empty/loading)
    if (calendarPlaceholder) calendarPlaceholder.style.display = 'none';
    if (calendarHeader) calendarHeader.style.display = 'flex'; // Use flex for header layout
    if (calendarWeekdays) calendarWeekdays.style.display = 'grid';
    if (calendarDays) calendarDays.style.display = 'grid';

    // Show loading spinner IN calendar days area
    if (calendarDays) calendarDays.innerHTML = '<div class="loading-spinner" style="margin: 1rem auto; grid-column: span 7;"></div>'; 
    if (calendarHeader) calendarHeader.querySelector('#month-year').textContent = 'Loading...'; // Update header text
    if (sectionList) sectionList.innerHTML = '<p class="placeholder-text">Select a date first</p>';
    if (recordsDiv) recordsDiv.innerHTML = '<p class="placeholder-text">Select a section first</p>';
    if (exportBtn) exportBtn.style.display = 'none'; // Hide export btn

    // Fetch attendance dates and Render the calendar for the current month
    currentCalendarDate = new Date(); // Reset to current month when subject changes
    await renderCalendar(classId, currentCalendarDate);
}

// Function to render the calendar for the selected class and month/year
async function renderCalendar(classId, displayDate) {
    // Add isInitialLoad flag based on whether classId is provided
    const isInitialLoad = !classId;

    const calendarHeader = document.getElementById('calendar-header');
    const monthYearSpan = document.getElementById('month-year');
    const weekdaysDiv = document.getElementById('calendar-weekdays');
    const daysDiv = document.getElementById('calendar-days');
    const prevMonthBtn = document.getElementById('prev-month-btn');
    const nextMonthBtn = document.getElementById('next-month-btn');

    if (!monthYearSpan || !weekdaysDiv || !daysDiv || !prevMonthBtn || !nextMonthBtn || !calendarHeader) {
        console.error("Calendar elements not found!");
        if (daysDiv) daysDiv.innerHTML = '<p class="placeholder-text error">Error: Calendar UI missing.</p>';
        return;
    }

    // -- 1. Fetch Attendance Dates for the Class (ONLY if classId is provided) --
    if (!isInitialLoad) {
        // Show loading in days grid while fetching
        daysDiv.innerHTML = '<div class="loading-spinner" style="margin: 1rem auto; grid-column: span 7;"></div>';
        monthYearSpan.textContent = 'Loading...';
        try {
            
            const response = await fetchWithAuth(`/auth/class-sessions/${classId}`);
            if (!response.ok) {
                throw new Error(`Server returned ${response.status}: ${response.statusText}`);
            }
            const data = await response.json();
            if (data.success && data.dates) {
                attendanceDatesSet = new Set(data.dates); // Store fetched dates (YYYY-MM-DD)
                
            } else {
                attendanceDatesSet = new Set(); // Reset if fetch failed or no dates
                console.warn('No attendance dates found or failed to fetch for class:', classId);
            }
        } catch (error) {
            console.error('Error loading distinct session dates for calendar:', error);
            attendanceDatesSet = new Set(); // Reset on error
            daysDiv.innerHTML = `<p class="placeholder-text error" style="grid-column: span 7;">Error loading attendance dates: ${error.message}</p>`;
            monthYearSpan.textContent = 'Error';
            return; // Stop rendering if dates couldn't be fetched
        }
    } else {
        // For initial load, ensure the set is empty
        attendanceDatesSet = new Set();
    }

    // -- 2. Calendar Calculations --
    const year = displayDate.getFullYear();
    const month = displayDate.getMonth(); // 0-indexed

    const firstDayOfMonth = new Date(year, month, 1);
    const lastDayOfMonth = new Date(year, month + 1, 0);
    const daysInMonth = lastDayOfMonth.getDate();
    const startDayOfWeek = firstDayOfMonth.getDay(); // 0 = Sunday, 1 = Monday, ...

    const today = new Date();
    const todayStr = formatDateToYYYYMMDD(today);

    // -- 3. Render Header --
    // Always update the month/year display
    monthYearSpan.textContent = displayDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    // Remove previous listeners before adding new ones to prevent duplicates
    prevMonthBtn.replaceWith(prevMonthBtn.cloneNode(true));
    nextMonthBtn.replaceWith(nextMonthBtn.cloneNode(true));
    // Re-select buttons after cloning
    const newPrevMonthBtn = document.getElementById('prev-month-btn');
    const newNextMonthBtn = document.getElementById('next-month-btn');

    newPrevMonthBtn.onclick = () => {
        currentCalendarDate.setMonth(currentCalendarDate.getMonth() - 1);
        renderCalendar(currentSelectedClassId, currentCalendarDate);
    };
    newNextMonthBtn.onclick = () => {
        currentCalendarDate.setMonth(currentCalendarDate.getMonth() + 1);
        renderCalendar(currentSelectedClassId, currentCalendarDate);
    };

    // -- 4. Render Weekdays --
    weekdaysDiv.innerHTML = ''; // Clear previous
    const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    weekdays.forEach(day => {
        const weekdayEl = document.createElement('div');
        weekdayEl.className = 'weekday';
        weekdayEl.textContent = day;
        weekdaysDiv.appendChild(weekdayEl);
    });

    // -- 5. Render Days --
    daysDiv.innerHTML = ''; // Clear previous days/spinner
    
    // Ensure header text is set even on initial load error, but before clearing daysDiv
    // (Moved header text setting up to step 3)
    // if (isInitialLoad && !monthYearSpan.textContent.includes('Error')) {
    //     monthYearSpan.textContent = displayDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    // }

    let dateCounter = 1;

    // Calculate days from previous month
    const prevMonthLastDay = new Date(year, month, 0).getDate();
    const prevMonthStartDay = prevMonthLastDay - startDayOfWeek + 1;

    // Render days from previous month
    for (let i = 0; i < startDayOfWeek; i++) {
        const dayEl = document.createElement('div');
        dayEl.className = 'calendar-day day-out-month';
        dayEl.textContent = prevMonthStartDay + i;
        daysDiv.appendChild(dayEl);
    }

    // Render days of the current month
    for (let i = 1; i <= daysInMonth; i++) {
        const dayEl = document.createElement('div');
        const currentDate = new Date(year, month, i);
        const currentDateStr = formatDateToYYYYMMDD(currentDate);

        dayEl.className = 'calendar-day day-in-month';
        dayEl.textContent = i;
        dayEl.dataset.date = currentDateStr; // Store YYYY-MM-DD
        dayEl.dataset.classId = classId; // Store classId

        if (currentDateStr === todayStr) {
            dayEl.classList.add('today');
        }

        if (attendanceDatesSet.has(currentDateStr)) {
            dayEl.classList.add('has-attendance');
            dayEl.addEventListener('click', handleCalendarDateClick);
        } else {
            // Optional: Make non-attendance days less prominent
             dayEl.style.opacity = '0.7'; 
             dayEl.style.cursor = 'not-allowed';
        }

        daysDiv.appendChild(dayEl);
    }

    // Render days from next month to fill the grid
    const totalCells = startDayOfWeek + daysInMonth;
    const remainingCells = (totalCells % 7 === 0) ? 0 : 7 - (totalCells % 7);
    for (let i = 1; i <= remainingCells; i++) {
        const dayEl = document.createElement('div');
        dayEl.className = 'calendar-day day-out-month';
        dayEl.textContent = i;
        daysDiv.appendChild(dayEl);
    }

    // Ensure calendar parts are visible now
    calendarHeader.style.display = 'flex';
    weekdaysDiv.style.display = 'grid';
    daysDiv.style.display = 'grid';
}


// Handler for clicking a date cell in the calendar
function handleCalendarDateClick(event) {
    const selectedCell = event.currentTarget; // Use currentTarget for the element listener is attached to
    const classId = selectedCell.dataset.classId;
    const date = selectedCell.dataset.date; // YYYY-MM-DD format

    if (!date || !classId) {
        console.error("Missing date or classId on clicked calendar cell", selectedCell.dataset);
        return;
    }

    

    // Visually mark selected date
    document.querySelectorAll('#calendar-days .calendar-day').forEach(cell => cell.classList.remove('selected-date'));
    selectedCell.classList.add('selected-date');

    // Reset subsequent containers
    const sectionList = document.getElementById('attendance-section-list');
    const recordsDiv = document.getElementById('attendance-records');
    const exportBtn = document.getElementById('export-attendance-btn');

    if (sectionList) sectionList.innerHTML = '<div class="loading-spinner" style="margin: 1rem auto;"></div>'; // Show spinner
    if (recordsDiv) recordsDiv.innerHTML = '<p class="placeholder-text">Select a section first</p>';
    if (exportBtn) exportBtn.style.display = 'none'; // Hide export btn until records load

    // Fetch and populate sections for this class/date
    loadAttendanceSections(classId, date); // Use the existing function
}


// Function to load sections for the selected class and date (NO CHANGE NEEDED HERE)
async function loadAttendanceSections(classId, date) {
    const sectionList = document.getElementById('attendance-section-list');
    if (!sectionList) return;

    try {
        
        const response = await fetchWithAuth(`/auth/sessions-on-date?classId=${classId}&date=${date}`);

        if (!response.ok) {
            throw new Error(`Failed to fetch sections: ${response.status}`);
        }
        const data = await response.json();
        

        sectionList.innerHTML = ''; // Clear spinner/placeholder

        if (data.success && data.sections && data.sections.length > 0) {
            data.sections.forEach(sec => {
                const sectionBox = document.createElement('div');
                sectionBox.className = 'selector-box';
                sectionBox.textContent = sec.section || 'Default Section'; // Handle null/empty sections
                sectionBox.dataset.sessionId = sec.session_id; // Store the specific session ID
                sectionBox.addEventListener('click', handleSectionBoxClick);
                sectionList.appendChild(sectionBox);
        });
    } else {
            sectionList.innerHTML = '<p class="placeholder-text">No sections found for this date.</p>';
        }
    } catch (error) {
        console.error('Error fetching sections:', error);
        if (sectionList) sectionList.innerHTML = `<p class="placeholder-text error">Error loading sections: ${error.message}</p>`;
    }
}

// Handler for clicking a section box (NO CHANGE NEEDED HERE)
function handleSectionBoxClick(event) {
    const selectedBox = event.target;
    const sessionId = selectedBox.dataset.sessionId;

    

    // Visually mark selected section
    document.querySelectorAll('#attendance-section-list .selector-box').forEach(box => box.classList.remove('selected'));
    selectedBox.classList.add('selected');

    // Reset attendees container and show loading spinner
    const recordsDiv = document.getElementById('attendance-records');
    const exportBtn = document.getElementById('export-attendance-btn');
    if (recordsDiv) recordsDiv.innerHTML = '<div class="loading-spinner" style="margin: 1rem auto;"></div>';
    if (exportBtn) exportBtn.style.display = 'none'; // Hide export btn until records load

    // Load the attendance records for the specific session ID
    currentViewSessionId = sessionId; // Store session ID for potential export
    loadAttendanceRecords(sessionId);
}

// --- End New Attendance View Handlers ---

// --- REMOVED Server-Sent Events (SSE) for Real-time Updates ---

// --- NEW: Teacher Profile Modal Functions ---

function showTeacherProfileModal() {
    console.log('DEBUG: showTeacherProfileModal called'); // <-- Log 4
    const modalOverlay = document.getElementById('teacher-profile-modal-overlay');
    console.log('DEBUG: Found Modal Overlay?', modalOverlay); // <-- Log 5
    if (modalOverlay) {
        modalOverlay.classList.add('visible');
        document.body.style.overflow = 'hidden'; // Prevent background scroll
        loadTeacherProfileData(); // Load data when modal is shown
    }
}

function hideTeacherProfileModal() {
    const modalOverlay = document.getElementById('teacher-profile-modal-overlay');
    if (modalOverlay) {
        modalOverlay.classList.remove('visible');
        document.body.style.overflow = ''; // Restore background scroll
        // Clear any previous messages when hiding
        const messageArea = document.getElementById('teacher-profile-message');
        if(messageArea) {
            messageArea.textContent = '';
            messageArea.className = '';
        }
    }
}

async function loadTeacherProfileData() {
    const firstNameInput = document.getElementById('teacher-profile-first-name');
    const lastNameInput = document.getElementById('teacher-profile-last-name');
    const messageArea = document.getElementById('teacher-profile-message');
    const saveButton = document.getElementById('save-teacher-profile-btn');

    if (!firstNameInput || !lastNameInput || !messageArea || !saveButton) {
        console.error('Teacher profile modal elements not found for loading.');
        return;
    }

    messageArea.textContent = 'Loading profile...';
    messageArea.className = 'info-message'; // Optional: style info messages
    saveButton.disabled = true; // Disable save while loading

    try {
        // Use the correct endpoint path relative to API_URL
        const response = await fetchWithAuth(`/auth/teacher/profile`); 
        const data = await response.json();

        if (data.success && data.user) {
            firstNameInput.value = data.user.first_name || '';
            lastNameInput.value = data.user.last_name || '';
            messageArea.textContent = ''; // Clear loading message
            messageArea.className = '';
        } else {
            messageArea.textContent = `Error loading profile: ${data.message || 'Unknown error'}`;
            messageArea.className = 'error-message'; // Optional: style error messages
        }
    } catch (error) {
        console.error('Error fetching teacher profile:', error);
        messageArea.textContent = `Network error: ${error.message}`;
        messageArea.className = 'error-message';
    } finally {
        saveButton.disabled = false; // Re-enable save button
    }
}

async function handleTeacherProfileUpdate(event) {
    event.preventDefault();

    const firstNameInput = document.getElementById('teacher-profile-first-name');
    const lastNameInput = document.getElementById('teacher-profile-last-name');
    const messageArea = document.getElementById('teacher-profile-message');
    const saveButton = document.getElementById('save-teacher-profile-btn');

    if (!firstNameInput || !lastNameInput || !messageArea || !saveButton) {
        console.error('Teacher profile modal elements not found for update.');
        return;
    }

    const updatedProfile = {
        firstName: firstNameInput.value.trim(),
        lastName: lastNameInput.value.trim()
    };

    // Basic validation
    if (!updatedProfile.firstName || !updatedProfile.lastName) {
        messageArea.textContent = 'First name and last name cannot be empty.';
        messageArea.className = 'error-message';
        return;
    }

    const originalButtonHTML = saveButton.innerHTML;
    saveButton.disabled = true;
    saveButton.innerHTML = '<div class="spinner spinner-small" style="width: 1.2em; height: 1.2em; border-width: 2px; display: inline-block; margin-right: 0.5em; vertical-align: text-bottom;"></div> Saving...';
    messageArea.textContent = '';
    messageArea.className = '';

    try {
        // Use the correct endpoint path relative to API_URL
        const response = await fetchWithAuth(`/auth/teacher/profile`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(updatedProfile)
        });

        const data = await response.json();

        if (data.success) {
            messageArea.textContent = 'Profile updated successfully!';
            messageArea.className = 'success-message'; // Optional: style success messages

            // Update sessionStorage
            sessionStorage.setItem('firstName', updatedProfile.firstName);
            sessionStorage.setItem('lastName', updatedProfile.lastName);
            // No header name to update on teacher dashboard

            // Optional: Auto-hide success message and/or close modal after delay
            setTimeout(() => {
                // hideTeacherProfileModal(); // Optionally close modal
                 if (messageArea.textContent === 'Profile updated successfully!') {
                     messageArea.textContent = ''; // Clear only if it's the success message
                     messageArea.className = '';
                 }
            }, 2500);
    } else {
            messageArea.textContent = `Update failed: ${data.message || 'Unknown error'}`;
            messageArea.className = 'error-message';
        }
    } catch (error) {
        console.error('Error updating teacher profile:', error);
        messageArea.textContent = `Network error: ${error.message}`;
        messageArea.className = 'error-message';
    } finally {
        saveButton.disabled = false;
        saveButton.innerHTML = originalButtonHTML;
    }
}

// --- END: Teacher Profile Modal Functions ---
