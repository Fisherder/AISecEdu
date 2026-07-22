document.addEventListener("DOMContentLoaded", async function () {
  const root = document.getElementById("learning-overview");
  if (!root) return;

  const learning = window.DojoLearning;
  const notice = document.getElementById("learning-overview-notice");

  try {
    const response = await learning.request("/learning/overview");
    if (!response.success) throw new Error(learning.errorMessage(response, "Learning data could not be loaded."));

    const summary = response.summary || {};
    document.getElementById("learning-stat-courses").textContent = summary.enrolledCourses || 0;
    document.getElementById("learning-stat-modules").textContent = summary.modules || 0;
    document.getElementById("learning-stat-completed").textContent = summary.completedItems || 0;
    document.getElementById("learning-stat-submissions").textContent = summary.submissions || 0;

    const activeSection = document.getElementById("learning-active-section");
    const activeContainer = document.getElementById("learning-active-attempt");
    if (response.activeAttempt) {
      const attempt = response.activeAttempt;
      const href = `/${encodeURIComponent(attempt.dojoId)}/${encodeURIComponent(attempt.moduleId)}/${encodeURIComponent(attempt.challengeId)}`;
      activeContainer.innerHTML = `
        <div class="card">
          <div class="card-body">
            <div>
              <h3>${learning.escapeHtml(attempt.challengeName)}</h3>
              <p>${learning.escapeHtml(attempt.dojoName)} &middot; ${learning.escapeHtml(attempt.moduleName)} &middot; Session ${learning.escapeHtml(attempt.epoch)}</p>
            </div>
            <a class="btn btn-primary" href="${learning.escapeHtml(href)}">Continue Exercise</a>
          </div>
        </div>`;
      activeSection.hidden = false;
    }

    const courses = response.enrolledCourses || [];
    document.getElementById("learning-course-list").innerHTML = courses
      .map(course => learning.courseCard(course, course.learningUrl))
      .join("");
    document.getElementById("learning-course-empty").hidden = courses.length !== 0;
    learning.showNotice(notice, "");
  } catch (error) {
    learning.showNotice(notice, error.message || "Learning data could not be loaded.", "danger");
  }
});
