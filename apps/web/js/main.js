// EazyAttend Landing Page Scripts
document.addEventListener('DOMContentLoaded', function() {
  // Navbar Elements
  const navbar = document.querySelector('.navbar');
  const mobileMenuBtn = document.querySelector('.mobile-menu-btn');
  const navLinks = document.querySelectorAll('.nav-link');

  // Navbar dynamic shadow on scroll
  window.addEventListener('scroll', () => {
    if (window.scrollY > 20) {
      navbar.style.boxShadow = '0 4px 20px rgba(0, 0, 0, 0.05)';
      navbar.style.background = 'rgba(255, 255, 255, 0.92)';
    } else {
      navbar.style.boxShadow = 'none';
      navbar.style.background = 'rgba(255, 255, 255, 0.82)';
    }
  });

  // Mobile Menu Toggle
  if (mobileMenuBtn && navbar) {
    const menuIcon = mobileMenuBtn.querySelector('i');
    mobileMenuBtn.addEventListener('click', () => {
      navbar.classList.toggle('active');
      if (menuIcon) {
        menuIcon.classList.toggle('fa-bars');
        menuIcon.classList.toggle('fa-times');
      }
    });

    // Close menu when clicking navigation links
    navLinks.forEach(link => {
      link.addEventListener('click', () => {
        if (navbar.classList.contains('active')) {
          navbar.classList.remove('active');
          if (menuIcon) {
            menuIcon.classList.add('fa-bars');
            menuIcon.classList.remove('fa-times');
          }
        }
      });
    });
  }

  // Smooth scroll for anchor navigation links
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function(e) {
      const targetId = this.getAttribute('href');
      if (targetId === '#') return;
      
      const targetElement = document.querySelector(targetId);
      if (targetElement) {
        e.preventDefault();
        const headerOffset = 80;
        const elementPosition = targetElement.getBoundingClientRect().top;
        const offsetPosition = elementPosition + window.pageYOffset - headerOffset;

        window.scrollTo({
          top: offsetPosition,
          behavior: 'smooth'
        });
      }
    });
  });

  // Scroll Animation using IntersectionObserver
  const sectionsToAnimate = document.querySelectorAll('.scroll-animate');
  if ('IntersectionObserver' in window && sectionsToAnimate.length > 0) {
    const sectionObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    }, {
      threshold: 0.15,
      rootMargin: '0px 0px -50px 0px'
    });

    sectionsToAnimate.forEach(section => {
      sectionObserver.observe(section);
    });
  } else {
    // Fallback for browsers without IntersectionObserver
    sectionsToAnimate.forEach(section => {
      section.classList.add('visible');
    });
  }

  // Contact Form Submission Handler
  const contactForm = document.getElementById('contact-form');
  const formStatus = document.getElementById('contact-form-status');
  const submitButton = document.getElementById('contact-submit-btn');

  if (contactForm && formStatus && submitButton) {
    contactForm.addEventListener('submit', async function(event) {
      event.preventDefault();

      const nameInput = document.getElementById('contact-name');
      const emailInput = document.getElementById('contact-email');
      const subjectInput = document.getElementById('contact-subject');
      const messageInput = document.getElementById('contact-message');

      // Validation
      if (!nameInput.value.trim() || !emailInput.value.trim() || !subjectInput.value.trim() || !messageInput.value.trim()) {
        showStatus('Please fill out all fields.', 'error');
        return;
      }

      if (!isValidEmail(emailInput.value.trim())) {
        showStatus('Please enter a valid email address.', 'error');
        return;
      }

      const formData = {
        name: nameInput.value.trim(),
        email: emailInput.value.trim(),
        subject: subjectInput.value.trim(),
        message: messageInput.value.trim()
      };

      // Loading State
      showStatus('Sending your message...', 'loading');
      submitButton.disabled = true;
      const originalButtonHTML = submitButton.innerHTML;
      submitButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> <span>Sending...</span>';

      try {
        const response = await fetch(`${API_URL}/auth/contact-submit`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify(formData)
        });

        const result = await response.json();

        if (response.ok && result.success) {
          showStatus(result.message || 'Message sent successfully! We will get back to you soon.', 'success');
          contactForm.reset();
        } else {
          showStatus(result.message || 'An error occurred. Please try again later.', 'error');
        }
      } catch (error) {
        console.error('Contact form error:', error);
        showStatus('A network error occurred. Please check your connection and try again.', 'error');
      } finally {
        submitButton.disabled = false;
        submitButton.innerHTML = originalButtonHTML;
      }
    });

    function showStatus(message, type) {
      formStatus.textContent = message;
      formStatus.className = `form-status-message ${type}`;
    }
  }

  function isValidEmail(email) {
    return /^\S+@\S+\.\S+$/.test(email);
  }
});