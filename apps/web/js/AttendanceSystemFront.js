import API_URL from "./config.js";

// View attendance button functionality
const viewAttendanceButton = document.getElementById("view-attendance");

if (viewAttendanceButton) {
  viewAttendanceButton.addEventListener("click", async () => {
    const userId = sessionStorage.getItem("userId");
    const role = sessionStorage.getItem("userRole");

    if (!userId || !role) {
      alert("You are not logged in. Please log in first.");
      window.location.href = "/login";
      return;
    }

    if (role !== "teacher") {
      alert("Only teachers can view attendance reports.");
      return;
    }

    // Get the selected session ID from the dropdown
    const sessionDropdown = document.getElementById("session-dropdown");
    const sessionId = sessionDropdown.value.trim();

    if (!sessionId) {
      alert("Please select a session.");
      return;
    }

    // Fetch attendance reports
    try {
      const response = await fetch(
        `${API_URL}/auth/attendance-reports?session_id=${sessionId}&teacher_id=${userId}`,
        {
          method: "GET",
          credentials: "include", // Include session cookies
        }
      );

      const data = await response.json();

      if (data.success) {
        const attendanceList = document.getElementById("attendance-list");

        if (data.attendance.length === 0) {
          attendanceList.innerHTML = "<p>No attendance records found for this session.</p>";
          return;
        }

        let html = "<h3>Attendance List</h3><ul>";
        data.attendance.forEach((record) => {
          html += `<li>${record.studentName} - ${new Date(record.timestamp).toLocaleString()}</li>`;
        });
        html += "</ul>";

        attendanceList.innerHTML = html;
      } else {
        alert(data.message);
      }
    } catch (error) {
      console.error("Fetch attendance error:", error);
      alert("Failed to fetch attendance reports.");
    }
  });
}

async function fetchSessions() {
  const userId = sessionStorage.getItem("userId");

  try {
    const response = await fetch(`${API_URL}/auth/sessions?teacher_id=${userId}`, {
      method: "GET",
      credentials: "include", // Include session cookies
    });

    const data = await response.json();

    if (data.success) {
      const sessionDropdown = document.getElementById("session-dropdown");
      sessionDropdown.innerHTML = ""; // Clear previous options

      data.sessions.forEach((session) => {
        const option = document.createElement("option");
        option.value = session.session_id;
        option.textContent = session.session_id;
        sessionDropdown.appendChild(option);
      });
    } else {
      alert(data.message);
    }
  } catch (error) {
    console.error("Fetch sessions error:", error);
    alert("Failed to fetch sessions.");
  }
}