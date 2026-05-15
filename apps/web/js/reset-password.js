document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('reset-password-form');
    const messageArea = document.getElementById('reset-message');
    const tokenInput = document.getElementById('reset-token');
    const newPasswordInput = document.getElementById('new-password');
    const confirmPasswordInput = document.getElementById('confirm-password');
    const submitButton = document.getElementById('submit-reset-btn');
    const backToLoginDiv = document.getElementById('back-to-login');
    const instructionsP = document.getElementById('reset-instructions');

    // --- Get token from URL --- 
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');

    if (!token) {
        showMessage('error', 'Invalid or missing password reset token. Please request a new reset link.');
        form.style.display = 'none'; // Hide form if no token
        instructionsP.style.display = 'none';
        return;
    }

    tokenInput.value = token; // Store token in the hidden input

    // --- Form Submit Handler --- 
    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        clearMessage();

        const newPassword = newPasswordInput.value;
        const confirmPassword = confirmPasswordInput.value;

        // Basic Validation
        if (!newPassword || !confirmPassword) {
            showMessage('error', 'Please enter and confirm your new password.');
            return;
        }
        if (newPassword.length < 6) { // Example minimum length
             showMessage('error', 'Password must be at least 6 characters long.');
            return;
        }
        if (newPassword !== confirmPassword) {
            showMessage('error', 'Passwords do not match.');
            return;
        }

        // Disable button and show loading state
        submitButton.disabled = true;
        submitButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Setting Password...';

        try {
            // Use the globally available API_URL from config.js
            const response = await fetch(`${API_URL}/auth/reset-password`, { 
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    token: token, 
                    newPassword: newPassword,
                    confirmPassword: confirmPassword // Send confirmation for backend check
                })
            });

            const data = await response.json();

            if (response.ok && data.success) {
                showMessage('success', data.message || 'Password has been successfully reset!');
                form.style.display = 'none'; // Hide form on success
                instructionsP.style.display = 'none';
                backToLoginDiv.style.display = 'block'; // Show success message and login link
            } else {
                showMessage('error', data.message || 'Failed to reset password. The link may be invalid or expired.');
                submitButton.disabled = false;
                 submitButton.innerHTML = '<i class="fas fa-save"></i> Set New Password';
            }

        } catch (error) {
            console.error('Password reset error:', error);
            showMessage('error', `An error occurred: ${error.message}. Please try again.`);
            submitButton.disabled = false;
             submitButton.innerHTML = '<i class="fas fa-save"></i> Set New Password';
        }
    });

    // --- Password Toggle Visibility --- 
    const togglePasswordButtons = document.querySelectorAll('.toggle-password');
    togglePasswordButtons.forEach(button => {
        button.addEventListener('click', function() {
            const input = this.previousElementSibling; // Assumes button is immediately after input
            const icon = this.querySelector('i');
            if (input.type === 'password') {
                input.type = 'text';
                icon.classList.remove('fa-eye');
                icon.classList.add('fa-eye-slash');
                this.setAttribute('aria-label', 'Hide password');
            } else {
                input.type = 'password';
                icon.classList.remove('fa-eye-slash');
                icon.classList.add('fa-eye');
                this.setAttribute('aria-label', 'Show password');
            }
        });
    });

    // --- Helper Functions --- 
    function showMessage(type, text) {
        messageArea.textContent = text;
        messageArea.className = `message-area ${type}`; // Apply class for styling
    }

    function clearMessage() {
        messageArea.textContent = '';
        messageArea.className = 'message-area';
    }

}); 