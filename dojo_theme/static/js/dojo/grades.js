async function gradeWorkerModule() {
    importScripts("https://cdn.jsdelivr.net/pyodide/v0.27.3/full/pyodide.js");

    const pyodide = await loadPyodide();

    self.onmessage = async (event) => {
        const type = event.data.type;

        if (event.data.type === "load") {
            const { id, code } = event.data;
            try {
                await pyodide.loadPackagesFromImports(event.data.code);
                await pyodide.runPythonAsync(code);
                self.postMessage({ id, type: "loaded" });
            } catch (err) {
                self.postMessage({ id, type: "error", error: err.toString() });
            }
        }

        if (event.data.type === "grade") {
            const { id, data } = event.data;
            try {
                const grade = pyodide.globals.get("grade");
                const grades = JSON.parse(JSON.stringify(grade(pyodide.toPy(data)).toJs()));
                self.postMessage({ id, type: "graded", grades });
            } catch (err) {
                self.postMessage({ id, type: "error", error: err.toString() });
            }
        }
    };

    self.postMessage({ type: "ready" });
}


function createWorker(workerModule) {
    const sandboxedWorkerURL = `data:application/javascript;base64,${btoa("(" + workerModule.toString() + ")()")}`;
    const worker = new Worker(sandboxedWorkerURL);

    worker.onmessage = (event) => {
        if (event.data.type === "error") {
            console.error(event.data.error);
        }
    };

    worker.waitForMessage = (expectedType) =>
        new Promise((resolve) => {
          const handler = (event) => {
            if (event.data.type === expectedType) {
              worker.removeEventListener("message", handler);
              resolve(event.data);
            }
          };
          worker.addEventListener("message", handler);
        });

    return worker;
}


function createAssignmentGradesTable(gradesData) {
    const table = document.createElement("table");
    table.classList.add("table", "table-striped", "content-data-table", "is-nested");

    const fields = [];
    gradesData.assignments.forEach(item => {
        Object.keys(item).forEach(key => {
            if (!fields.includes(key))
                fields.push(key);
        });
    });

    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");
    const fieldLabels = {
        name: "名称",
        date: "日期",
        deadline: "截止日期",
        weight: "权重",
        progress: "进度",
        credit: "计分",
    };
    fields.forEach(key => {
        const cell = document.createElement("th");
        cell.textContent = fieldLabels[key] || key.replace(/\b\w/g, char => char.toUpperCase());
        headerRow.appendChild(cell);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    gradesData.assignments.forEach(item => {
        const row = document.createElement("tr");
        fields.forEach(key => {
            const cell = document.createElement("td");
            let value = item[key];
            if (value !== undefined && value !== null) {
                if (key === "credit")
                    value = (value * 100).toFixed(2) + "%";
                cell.textContent = value;
            }
            row.appendChild(cell);
        });
        tbody.appendChild(row);
    });
    table.appendChild(tbody);

    return table;
}

function csvEscape(value) {
    const text = String(value ?? "");
    if (/[",\n]/.test(text)) {
        return `"${text.replace(/"/g, "\"\"")}"`;
    }
    return text;
}

function buildGradesCsv(gradesTable) {
    const rows = [];
    rows.push([
        "student_id",
        "overall_grade",
        "overall_percent",
        "assignment_name",
        "deadline",
        "weight",
        "progress",
        "credit"
    ].map(csvEscape).join(","));

    if (!gradesTable || !gradesTable.tBodies.length) {
        return rows.join("\n");
    }

    const studentRows = gradesTable.tBodies[0].rows;
    for (const tr of studentRows) {
        const studentIdCell = tr.cells[0];
        const gradeCell = tr.cells[1];
        if (!studentIdCell || !gradeCell) {
            continue;
        }

        const studentId = studentIdCell.textContent.trim();
        const details = gradeCell.querySelector("details");
        if (!details) {
            continue;
        }

        const summary = details.querySelector("summary");
        const overallGrade = summary?.querySelector("strong")?.textContent.trim() || "";
        const overallPercent = (summary?.querySelector("span")?.textContent.trim() || "").replace(/%$/, "");

        const innerTable = details.querySelector("table");
        if (!innerTable || !innerTable.tBodies.length) {
            continue;
        }

        const assignmentBody = innerTable.tBodies[0];
        for (const ar of assignmentBody.rows) {
            const cells = ar.cells;
            if (cells.length < 5) {
                continue;
            }

            const assignmentName = cells[0].textContent.trim();
            const deadline = cells[1].textContent.trim();
            const weight = cells[2].textContent.trim();
            const progress = cells[3].textContent.trim();
            const credit = cells[4].textContent.trim();

            rows.push([
                studentId,
                overallGrade,
                overallPercent,
                assignmentName,
                deadline,
                weight,
                progress,
                credit
            ].map(csvEscape).join(","));
        }
    }

    return rows.join("\n");
}

function downloadGradesCsv(gradesTable) {
    const csv = buildGradesCsv(gradesTable);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "grades.csv";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}


async function loadGrades(selector) {
    const gradeWorker = createWorker(gradeWorkerModule);

    const coursePromise = fetch(`/pwncollege_api/v1/dojos/${init.dojo}/course`).then(response => response.json());
    const modulesPromise = fetch(`/pwncollege_api/v1/dojos/${init.dojo}/modules`).then(response => response.json());
    const solvesPromise = fetch(`/pwncollege_api/v1/dojos/${init.dojo}/solves`).then(response => response.json());
    const memesPromise = fetch(`/pwncollege_api/v1/discord/course/${init.dojo}/memes`).then(response => response.json());
    const thanksPromise = fetch(`/pwncollege_api/v1/discord/course/${init.dojo}/thanks`).then(response => response.json());

    await gradeWorker.waitForMessage("ready");
    const courseData = await coursePromise;

    gradeWorker.postMessage({ type: "load", code: courseData.course.scripts.grade });
    await gradeWorker.waitForMessage("loaded");

    const [modulesData, solvesData, memesData, thanksData] = await Promise.all([modulesPromise, solvesPromise, memesPromise, thanksPromise])
    gradeWorker.postMessage({ type: "grade", data: { course: courseData.course, modules: modulesData.modules, solves: solvesData.solves, thanks: thanksData.thanks, memes: memesData.memes } });

    const gradesData = (await gradeWorker.waitForMessage("graded")).grades;

    const gradesElement = document.querySelector(selector)
    gradesElement.innerHTML = "";

    const h3 = document.createElement("h3");
    const letterGrade = document.createElement("code");
    letterGrade.textContent = gradesData.overall.letter;
    letterGrade.style.fontSize = "2em";
    h3.append(
        document.createTextNode("你当前的课程成绩："),
        letterGrade,
        document.createTextNode(` (${(gradesData.overall.credit * 100).toFixed(2)}%)`)
    );
    gradesElement.appendChild(h3);

    const gradesTable = createAssignmentGradesTable(gradesData);
    gradesElement.appendChild(gradesTable);
}


async function loadAllGrades(selector) {
    const gradeWorker = createWorker(gradeWorkerModule);

    const coursePromise = fetch(`/pwncollege_api/v1/dojos/${init.dojo}/course`).then(response => response.json());
    const modulesPromise = fetch(`/pwncollege_api/v1/dojos/${init.dojo}/modules`).then(response => response.json());
    const solvesPromise = fetch(`/pwncollege_api/v1/dojos/${init.dojo}/course/solves`).then(response => response.json());
    const studentsPromise = fetch(`/pwncollege_api/v1/dojos/${init.dojo}/course/students`).then(response => response.json());

    await gradeWorker.waitForMessage("ready");
    const courseData = await coursePromise;

    gradeWorker.postMessage({ type: "load", code: courseData.course.scripts.grade });
    await gradeWorker.waitForMessage("loaded");

    const [modulesData, solvesData, studentsData] = await Promise.all([modulesPromise, solvesPromise, studentsPromise])

    const grades = {};
    for (const [studentToken, student] of Object.entries(studentsData.students)) {
      const course = { ...courseData.course, student: { ...student, token: studentToken } };
      const solves = solvesData.solves.filter(solve => solve.student_token === studentToken);
      gradeWorker.postMessage({ type: "grade", data: { course, modules: modulesData.modules, solves } });
      grades[studentToken] = (await gradeWorker.waitForMessage("graded")).grades;
    }

    const sortedGrades = Object.entries(grades).sort(([_, a], [__, b]) => b.overall.credit - a.overall.credit);

    const gradesElement = document.querySelector(selector)
    gradesElement.innerHTML = "";

    const table = document.createElement("table");
    table.classList.add("table", "table-striped", "content-data-table", "course-grades-table");

    const downloadButton = document.createElement("button");
    downloadButton.type = "button";
    downloadButton.classList.add("hub-button", "is-primary");
    downloadButton.innerHTML = '<i class="fas fa-download" aria-hidden="true"></i>下载 CSV';
    downloadButton.addEventListener("click", () => downloadGradesCsv(table));
    gradesElement.appendChild(downloadButton);
    gradesElement.appendChild(table);

    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");
    const studentHeaderCell = document.createElement("th");
    studentHeaderCell.textContent = "学生";
    headerRow.appendChild(studentHeaderCell);
    const gradeHeaderCell = document.createElement("th");
    gradeHeaderCell.textContent = "成绩";
    gradeHeaderCell.style.width = "80%";
    headerRow.appendChild(gradeHeaderCell);
    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    sortedGrades.forEach(([studentToken, studentGrades]) => {
        const row = document.createElement("tr");
        const studentCell = document.createElement("td");
        studentCell.textContent = studentToken;
        row.appendChild(studentCell);

        const gradeCell = document.createElement("td");
        const details = document.createElement("details");
        details.classList.add("content-table-details");

        const summary = document.createElement("summary");
        const letter = document.createElement("strong");
        letter.textContent = studentGrades.overall.letter;
        const percent = document.createElement("span");
        percent.textContent = `${(studentGrades.overall.credit * 100).toFixed(2)}%`;
        const chevron = document.createElement("i");
        chevron.classList.add("fas", "fa-chevron-down");
        chevron.setAttribute("aria-hidden", "true");
        summary.append(letter, percent, chevron);
        details.appendChild(summary);

        const gradesTable = createAssignmentGradesTable(studentGrades);
        const nestedTable = document.createElement("div");
        nestedTable.classList.add("content-data-table-wrap", "is-nested");
        nestedTable.appendChild(gradesTable);
        details.appendChild(nestedTable);

        gradeCell.appendChild(details);
        row.appendChild(gradeCell);
        tbody.appendChild(row);
    });
    table.appendChild(tbody);
}
