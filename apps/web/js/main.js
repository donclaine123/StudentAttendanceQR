// Mobile menu toggle
document.addEventListener('DOMContentLoaded', function() {
  const mobileMenuBtn = document.querySelector('.mobile-menu-btn');
  const navContainer = document.querySelector('.nav-container');
  const navLinks = document.querySelector('.nav-links');
  const navActions = document.querySelector('.nav-actions');
  const navLinksOriginalHTML = navLinks ? navLinks.innerHTML : '';
  const navActionsHTML = navActions ? navActions.innerHTML : '';
  
  if (mobileMenuBtn && navContainer) {
    const menuIcon = mobileMenuBtn.querySelector('i');
    mobileMenuBtn.addEventListener('click', () => {
      mobileMenuBtn.classList.toggle('open');
      navContainer.classList.toggle('open');
      if (navContainer.classList.contains('open') && navLinks) {
        navLinks.innerHTML = navLinksOriginalHTML + navActionsHTML;
      } else if (navLinks) {
        navLinks.innerHTML = navLinksOriginalHTML;
      }
      if (menuIcon) {
        menuIcon.classList.toggle('fa-bars');
        menuIcon.classList.toggle('fa-times');
      }
    });
  }
  
  // Add subtle animations for enhanced UX
  const heroContent = document.querySelector('.hero-content');
  if (heroContent) {
    heroContent.style.opacity = '0';
    heroContent.style.transform = 'translateY(20px)';
    
    setTimeout(() => {
      heroContent.style.transition = 'opacity 0.8s ease, transform 0.8s ease';
      heroContent.style.opacity = '1';
      heroContent.style.transform = 'translateY(0)';
    }, 300);
  }
  
  // Animate feature cards on scroll
  const featureCards = document.querySelectorAll('.feature-card');
  
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('animated');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1 });
  
  featureCards.forEach(card => {
    card.style.opacity = '0';
    card.style.transform = 'translateY(20px)';
    card.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
    observer.observe(card);
  });
  
  // Add class when cards are in view
  document.addEventListener('scroll', () => {
    featureCards.forEach(card => {
      const rect = card.getBoundingClientRect();
      if (rect.top < window.innerHeight - 100) {
        card.style.opacity = '1';
        card.style.transform = 'translateY(0)';
      }
    });
  });
  
  // Add hover effects to buttons
  const buttons = document.querySelectorAll('button');
  buttons.forEach(button => {
    button.addEventListener('mouseenter', () => {
      button.style.transform = 'translateY(-2px)';
      button.style.boxShadow = '0 6px 12px rgba(0, 0, 0, 0.15)';
    });
    
    button.addEventListener('mouseleave', () => {
      button.style.transform = 'translateY(0)';
      button.style.boxShadow = '';
    });
  });

  // Close mobile menu when a link is clicked (optional)
  const mobileLinks = navLinks.querySelectorAll('a');
  mobileLinks.forEach(link => {
    link.addEventListener('click', () => {
      if (navLinks.classList.contains('active')) {
        navLinks.classList.remove('active');
      }
    });
  });

  // --- Scroll Animation Logic --- 
  const sectionsToAnimate = document.querySelectorAll('.scroll-animate');

  if ('IntersectionObserver' in window && sectionsToAnimate.length > 0) {
    const sectionObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          // Element is entering the viewport - Add visible class to animate
          entry.target.classList.add('visible');
        } else {
          // Element is leaving the viewport
          // Only remove 'visible' if it's scrolled *above* the viewport
          // This prevents it from hiding again if you scroll past it downwards
          if (entry.boundingClientRect.top > 0) {
             entry.target.classList.remove('visible');
          }
        }
      });
    }, {
        threshold: 0.1 // Trigger when 10% of the section is visible
    });

    sectionsToAnimate.forEach(section => {
      sectionObserver.observe(section);
    });
  } else {
    // Fallback for older browsers or if no elements found: just make them visible
    sectionsToAnimate.forEach(section => {
      section.classList.add('visible');
    });
  }
  // --- End Scroll Animation Logic ---

  // Smooth scrolling for navigation links
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
      e.preventDefault();
      const targetId = this.getAttribute('href');
      const targetElement = document.querySelector(targetId);
      if (targetElement) {
        targetElement.scrollIntoView({
          behavior: 'smooth'
        });
      }
    });
  });

  // Scroll animations
  const animatedElements = document.querySelectorAll('.scroll-animate');
  const observerScroll = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
      } // Optional: remove class when element leaves viewport
      // else {
      //   entry.target.classList.remove('visible');
      // }
    });
  }, {
    threshold: 0.1 // Trigger when 10% of the element is visible
  });

  animatedElements.forEach(el => {
    observerScroll.observe(el);
  });

  // Mobile menu toggle
  const mobileMenuButton = document.querySelector('.mobile-menu-btn');
  const navbar = document.querySelector('.navbar');

  if (mobileMenuButton && navbar) {
    mobileMenuButton.addEventListener('click', () => {
      navbar.classList.toggle('active');
    });
  }

  // Close mobile menu when a link is clicked
  const navLinksScroll = document.querySelectorAll('.nav-links a');
  if (navLinksScroll && navbar) {
    navLinksScroll.forEach(link => {
      link.addEventListener('click', () => {
        if (navbar.classList.contains('active')) {
           navbar.classList.remove('active');
        }
      });
    });
  }

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

      // Basic Client-Side Validation
      if (!nameInput.value.trim() || !emailInput.value.trim() || !subjectInput.value.trim() || !messageInput.value.trim()) {
        formStatus.textContent = 'Please fill out all fields.';
        formStatus.className = 'form-status-message error';
        return;
      }

      if (!isValidEmail(emailInput.value.trim())) {
        formStatus.textContent = 'Please enter a valid email address.';
        formStatus.className = 'form-status-message error';
        return;
      }

      const formData = {
        name: nameInput.value.trim(),
        email: emailInput.value.trim(),
        subject: subjectInput.value.trim(),
        message: messageInput.value.trim()
      };

      // Display loading state
      formStatus.textContent = 'Sending your message...';
      formStatus.className = 'form-status-message loading';
      submitButton.disabled = true;
      submitButton.textContent = 'Sending...';

      try {
        const apiUrl = '/auth/contact-submit'; // Changed from /api/contact-submit

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
          formStatus.textContent = result.message || 'Message sent successfully! We will get back to you soon.';
          formStatus.className = 'form-status-message success';
          contactForm.reset(); // Clear the form
        } else {
          formStatus.textContent = result.message || 'An error occurred. Please try again later.';
          formStatus.className = 'form-status-message error';
        }
      } catch (error) {
        console.error('Contact form submission error:', error);
        formStatus.textContent = 'A network error occurred. Please check your connection and try again.';
        formStatus.className = 'form-status-message error';
      } finally {
        submitButton.disabled = false;
        submitButton.textContent = 'Send Message';
      }
    });
  }

  // Helper function for email validation
  function isValidEmail(email) {
    // Simple regex for basic email validation
    const emailRegex = /^\S+@\S+\.\S+$/;
    return emailRegex.test(email);
  }
});