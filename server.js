const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = 3000;

// --- MIDDLEWARE ---
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true })); // Form data parse karne ke liye

// Static files server karna (HTML/CSS/JS 'public' folder mein honi chahiye)
app.use(express.static(path.join(__dirname, 'public')));

// --- DATABASE SETUP ---
const dbPath = path.resolve(__dirname, 'academia.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database', err.message);
    } else {
        console.log('Connected to the SQLite database.');
        initializeDatabase();
    }
});

// --- DATABASE SCHEMA ---
function initializeDatabase() {
    db.serialize(() => {
        // 1. Departments Table
        db.run(`CREATE TABLE IF NOT EXISTS departments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL
        )`);

        // 2. Faculty Table
        db.run(`CREATE TABLE IF NOT EXISTS faculty (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            first_name TEXT NOT NULL,
            last_name TEXT NOT NULL,
            email TEXT,
            department_id INTEGER,
            avatar_url TEXT,
            FOREIGN KEY(department_id) REFERENCES departments(id)
        )`);

        // 3. Students Table (Updated with Email)
        db.run(`CREATE TABLE IF NOT EXISTS students (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            student_id TEXT UNIQUE NOT NULL,
            first_name TEXT NOT NULL,
            last_name TEXT NOT NULL,
            email TEXT,
            department_id INTEGER,
            status TEXT CHECK(status IN ('Admitted', 'Pending', 'Waitlist')) DEFAULT 'Pending',
            class_year INTEGER,
            avatar_initials TEXT,
            avatar_color TEXT,
            FOREIGN KEY(department_id) REFERENCES departments(id)
        )`);

        // 4. Courses Table
        db.run(`CREATE TABLE IF NOT EXISTS courses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            course_code TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            department_id INTEGER,
            isActive BOOLEAN DEFAULT 1
        )`);

        // 5. Schedule Table
        db.run(`CREATE TABLE IF NOT EXISTS schedule (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            course_id INTEGER,
            faculty_id INTEGER,
            start_time TEXT, 
            location TEXT,
            FOREIGN KEY(course_id) REFERENCES courses(id),
            FOREIGN KEY(faculty_id) REFERENCES faculty(id)
        )`);

        // --- SEED DATA ---
        db.get("SELECT count(*) as count FROM departments", (err, row) => {
            if (row && row.count === 0) {
                console.log("Seeding Database...");
                db.run(`INSERT INTO departments (name) VALUES ('Computer Science'), ('Architecture'), ('Engineering'), ('Business')`);
                
                db.run(`INSERT INTO faculty (first_name, last_name, department_id, avatar_url) VALUES 
                    ('Alan', 'Turing', 1, 'https://ui-avatars.com/api/?name=Prof+A&background=random'),
                    ('Grace', 'Hopper', 1, 'https://ui-avatars.com/api/?name=Prof+G&background=random')`);

                db.run(`INSERT INTO students (student_id, first_name, last_name, department_id, status, class_year, avatar_initials, avatar_color) VALUES 
                    ('#ST-2024-001', 'John', 'Doe', 1, 'Admitted', 2026, 'JD', 'blue')`);
                
                db.run(`INSERT INTO courses (course_code, name, department_id) VALUES ('CS-101', 'Data Structures', 1)`);
                console.log("Database seeded successfully.");
            }
        });
    });
}

// --- API ENDPOINTS ---

// 1. SAVE Student
app.post('/api/students', (req, res) => {
    const { student_id, first_name, last_name, email, department_id, class_year } = req.body;
    
    // Avatar logic (paisa-bachao logic)
    const initials = (first_name[0] || '') + (last_name[0] || '');
    const colors = ['blue', 'amber', 'rose', 'cyan'];
    const randomColor = colors[Math.floor(Math.random() * colors.length)];

    const sql = `INSERT INTO students (student_id, first_name, last_name, email, department_id, class_year, avatar_initials, avatar_color) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
    
    const params = [student_id, first_name, last_name, email, department_id, class_year, initials, randomColor];
    
    db.run(sql, params, function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: "Student saved successfully!", id: this.lastID });
    });
});

// 2. SAVE Faculty
app.post('/api/faculty', (req, res) => {
    const { first_name, last_name, email, department_id } = req.body;
    const avatar = `https://ui-avatars.com/api/?name=${first_name}+${last_name}&background=random`;

    const sql = `INSERT INTO faculty (first_name, last_name, email, department_id, avatar_url) VALUES (?, ?, ?, ?, ?)`;
    
    db.run(sql, [first_name, last_name, email, department_id, avatar], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: "Faculty saved successfully!", id: this.lastID });
    });
});

// 3. GET Dashboard Stats
app.get('/api/stats', (req, res) => {
    const p1 = new Promise((res, rej) => db.get("SELECT COUNT(*) AS count FROM students", (err, row) => err ? rej(err) : res(row.count)));
    const p2 = new Promise((res, rej) => db.get("SELECT COUNT(*) AS count FROM courses WHERE isActive = 1", (err, row) => err ? rej(err) : res(row.count)));
    const p3 = new Promise((res, rej) => db.get("SELECT COUNT(*) AS count FROM faculty", (err, row) => err ? rej(err) : res(row.count)));

    Promise.all([p1, p2, p3]).then(results => {
        res.json({ total_students: results[0], active_courses: results[1], faculty_staff: results[2], fee_collection: "$2.4M" });
    }).catch(err => res.status(500).json({ error: err.message }));
});

// 4. GET Recent Students
app.get('/api/enrollments/recent', (req, res) => {
    const sql = `SELECT s.*, d.name as department_name FROM students s LEFT JOIN departments d ON s.department_id = d.id ORDER BY s.id DESC LIMIT 5`;
    db.all(sql, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ data: rows });
    });
});

// Fallback: Agar koi route match nahi hota aur request API ki nahi hai,
app.use((req, res, next) => {
    if (!req.url.startsWith('/api')) {
        res.sendFile(path.join(__dirname, 'public', 'index.html'));
    } else {
        res.status(404).json({ error: "API route not found" });
    }
});

// Server Start
app.listen(PORT, () => {
    console.log(`--- ACADEMIA SYSTEM READY AT http://localhost:${PORT} ---`);
});