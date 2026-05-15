document.addEventListener('DOMContentLoaded', function () {
  // Make sure the logo content is visible
  const logoContent = document.querySelector('.logo-content');
  if (logoContent) {
    logoContent.style.opacity = '1';
    logoContent.style.visibility = 'visible';
  }
  const logoElements = document.querySelectorAll('.logo-title, .logo-subtitle, .status-card');
  logoElements.forEach(element => {
    element.style.opacity = '1';
    element.style.visibility = 'visible';
  });

  // --- Add Page Load Animation Trigger ---
  setTimeout(() => {
    document.body.classList.add('page-loaded');
  }, 0); // 500ms delay
  // --- End Page Load Animation Trigger ---

  function setupSignupFormInteractions() {
    const signupForm = document.getElementById('signup-form');
  }

  function setupLoginForm() {
    const form = document.getElementById('login-form'); // Use the original login form ID
    if (!form) return;
    const submitButton = form.querySelector('#loginBtn'); // Use the original button ID
    if (!submitButton) return;
  }


  createGridPattern();
  createLogoGridPattern();
  createFloatingParticles();
  createFloatingRectangles();
  setupPasswordToggle(); // Setup for login password
  setupLoginForm(); // Setup login form simulation
  setupSignupFormInteractions(); // Setup role toggle, student ID visibility, etc.

  // Setup signup/login transitions (using updated IDs/classes)
  const showSignupBtn = document.getElementById('showSignup');
  const showLoginBtn = document.getElementById('showLogin'); // Assuming this ID exists in signup panel
  const leftPanel = document.querySelector('.left-panel');
  const rightPanel = document.querySelector('.right-panel'); // Target the whole right panel
  const signupPanel = document.querySelector('.signup-panel');
  const loginSection = document.getElementById('login-section'); // Target login section

  if (showSignupBtn && showLoginBtn && leftPanel && rightPanel && signupPanel && loginSection) {
    showSignupBtn.addEventListener('click', (e) => {
      e.preventDefault();
      leftPanel.classList.add('slide-right');
      rightPanel.classList.add('hide-login'); // Hide login content smoothly
      setTimeout(() => {
        signupPanel.classList.add('slide-in');
      }, 300); // Delay slightly after login fades
    });

    showLoginBtn.addEventListener('click', (e) => {
      e.preventDefault();
      signupPanel.classList.remove('slide-in');
      setTimeout(() => {
        leftPanel.classList.remove('slide-right');
        rightPanel.classList.remove('hide-login'); // Show login content again
      }, 300); // Delay slightly after signup slides out
    });
  } else {
    console.error("One or more elements for panel transition not found.");
  }
});

function createGridPattern() {
  const gridPattern = document.querySelector('.grid-pattern');
  if (!gridPattern) return;
  // Create horizontal lines
  for (let i = 0; i < 10; i++) { /* ... (code is the same) ... */ }
  // Create vertical lines
  for (let i = 0; i < 10; i++) { /* ... (code is the same) ... */ }
}
function createGridPattern() {
  const gridPattern = document.querySelector('.grid-pattern');
  if (!gridPattern) return;
  for (let i = 0; i < 10; i++) {
    const hLine = document.createElement('div');
    hLine.style.cssText = `position: absolute; left: 0; right: 0; top: ${i * 10}%; height: 1px; background: var(--eazy-cyan, #56E7E7); opacity: ${Math.random() * 0.5 + 0.25};`;
    gridPattern.appendChild(hLine);

    const vLine = document.createElement('div');
    vLine.style.cssText = `position: absolute; top: 0; bottom: 0; left: ${i * 10}%; width: 1px; background: var(--eazy-cyan, #56E7E7); opacity: ${Math.random() * 0.5 + 0.25};`;
    gridPattern.appendChild(vLine);
  }
}


function createLogoGridPattern() {
  const logoGridPattern = document.querySelector('.logo-grid-pattern');
  if (!logoGridPattern) return;
  for (let i = 0; i < 20; i++) {
    const hLine = document.createElement('div');
    hLine.style.cssText = `position: absolute; left: 0; right: 0; top: ${i * 5}%; height: 1px; background: var(--eazy-cyan, #56E7E7); opacity: ${Math.random() * 0.7 + 0.3};`;
    logoGridPattern.appendChild(hLine);

    const vLine = document.createElement('div');
    vLine.style.cssText = `position: absolute; top: 0; bottom: 0; left: ${i * 5}%; width: 1px; background: var(--eazy-cyan, #56E7E7); opacity: ${Math.random() * 0.7 + 0.3};`;
    logoGridPattern.appendChild(vLine);
  }
}

function createFloatingParticles() {
  const particles = document.getElementById('particles');
  if (!particles) return;
  for (let i = 0; i < 250; i++) {
    const particle = document.createElement('div');
    const color = i % 2 === 0 ? 'var(--eazy-cyan, #56E7E7)' : 'var(--eazy-pink, #FF2D9A)';
    particle.style.cssText = `position: absolute; width: ${Math.random() * 6 + 2}px; height: ${Math.random() * 6 + 2}px; background: ${color}; border-radius: 50%; left: ${Math.random() * 100}%; top: ${Math.random() * 100}%; opacity: ${Math.random() * 0.5 + 0.2}; box-shadow: 0 0 8px ${color}; animation: float ${Math.random() * 5 + 5}s infinite ease-in-out ${Math.random() * 5}s;`;
    particles.appendChild(particle);
  }
}


function createFloatingRectangles() {
  const rectangles = document.getElementById('floating-rectangles');
  if (!rectangles) return;
  for (let i = 0; i < 15; i++) {
    const rect = document.createElement('div');
    const borderColor = i % 3 === 0 ? 'var(--eazy-pink, #FF2D9A)' :
      (i % 3 === 1 ? 'var(--eazy-cyan, #56E7E7)' : 'var(--eazy-blue, #2D7FF9)');
    rect.style.cssText = `position: absolute; width: ${Math.random() * 60 + 20}px; height: ${Math.random() * 60 + 20}px; border: 2px solid ${borderColor}; left: ${Math.random() * 100}%; top: ${Math.random() * 100}%; opacity: ${Math.random() * 0.4 + 0.1}; transform: rotate(${Math.random() * 360}deg); animation: float ${Math.random() * 3 + 4}s infinite ease-in-out ${Math.random() * 2}s;`;
    rectangles.appendChild(rect);
  }
}

function setupPasswordToggle() {
  const toggleButtons = document.querySelectorAll('.toggle-password'); // Select all toggle buttons

  toggleButtons.forEach(button => {
    // Find the preceding input field within the same wrapper
    const wrapper = button.closest('.input-wrapper, .password-input-wrapper');
    const passwordInput = wrapper ? wrapper.querySelector('input[type="password"], input[type="text"]') : null;
    const eyeIcon = button.querySelector('.eye-icon'); // Assumes Font Awesome class

    if (!passwordInput || !eyeIcon) return;

    button.addEventListener('click', function () {
      const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
      passwordInput.setAttribute('type', type);

      // Toggle eye icon (using Font Awesome classes)
      if (type === 'text') {
        eyeIcon.classList.remove('fa-eye');
        eyeIcon.classList.add('fa-eye-slash');
      } else {
        eyeIcon.classList.remove('fa-eye-slash');
        eyeIcon.classList.add('fa-eye');
      }
    });
  });
}

const styleSheet = document.styleSheets[0];
    try {
      styleSheet.insertRule(`
            @keyframes float {
                0% { transform: translate(0, 0) rotate(0deg); }
                50% { transform: translate(calc(var(--float-x, 10px)), calc(var(--float-y, 10px))) rotate(180deg); }
                100% { transform: translate(0, 0) rotate(360deg); }
            }`, styleSheet.cssRules.length);

      styleSheet.insertRule(`
             @keyframes pulse {
                 0%, 100% { opacity: 0.8; transform: scale(1); }
                 50% { opacity: 0.4; transform: scale(0.95); }
             }`, styleSheet.cssRules.length);
      styleSheet.insertRule(`
             @keyframes breathe-glow {
                  0%, 100% {
                      border-color: rgba(255, 255, 255, 0.8);
                      box-shadow: 0 0 15px rgba(255, 255, 255, 0.5), 0 0 30px rgba(255, 255, 255, 0.3);
                  }
                  50% {
                      border-color: var(--eazy-pink, #FF2D9A);
                      box-shadow: 0 0 20px rgba(255, 45, 154, 0.6), 0 0 40px rgba(255, 45, 154, 0.4);
                  }
             }`, styleSheet.cssRules.length);
      styleSheet.insertRule(`
                @keyframes pulse-glow {
                    0%, 100% {
                        opacity: 0.2; /* Adjusted from styles.css for logo glow */
                    }
                    50% {
                        opacity: 0.4;
                    }
                }`, styleSheet.cssRules.length);

    } catch (e) {
      console.error("Could not insert keyframes: ", e);
    }
