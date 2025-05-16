const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt'); // <-- Add bcrypt
const nodemailer = require('nodemailer');
const dotenv = require("dotenv") // <-- Add nodemailer

const app = express();
const PORT = 5000;
const db = new sqlite3.Database('application1.db');
dotenv.config(); // <-- Load environment variables

// Create table if not exists
db.run(`
  CREATE TABLE IF NOT EXISTS applications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    email TEXT,
    mobile TEXT,
    gender TEXT,
    degree TEXT,
    experience TEXT,
    howKnow TEXT,
    resume TEXT,
    position TEXT,
    submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// Create users table if not exists
db.run(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

const USERNAME = "admin";
const PLAINTEXT_PASSWORD = "password123";
let AUTH_TOKEN = null;

// Insert admin user if not exists (with bcrypt hash)
db.get(`SELECT * FROM users WHERE username = ?`, [USERNAME], (err, row) => {
  if (err) {
    console.error('DB user select error:', err);
  } else if (!row) {
    const hash = bcrypt.hashSync(PLAINTEXT_PASSWORD, 10);
    db.run(`INSERT INTO users (username, password) VALUES (?, ?)`, [USERNAME, hash], (err) => {
      if (err) {
        console.error('DB user insert error:', err);
      } else {
        console.log('Admin user inserted into users table.');
      }
    });
  }
});

// Configure nodemailer transporter (example using Gmail, replace with your SMTP settings)
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD
  },
  tls: { rejectUnauthorized: false }
});

// Middleware
app.use(cors());
app.use(express.json());

// Login route
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  console.log(req.body);
  db.get(
    `SELECT * FROM users WHERE username = ?`,
    [username],
    (err, row) => {
      if (err) {
        console.error('DB user select error:', err);
        return res.status(500).json({ message: 'Database error' });
      }
      if (row && bcrypt.compareSync(password, row.password)) {
        AUTH_TOKEN = Math.random().toString(36).substring(2); // simple random token
        return res.json({ token: AUTH_TOKEN });
      }
      res.status(401).json({ message: "Invalid credentials" });
    }
  );
});

// Middleware to check token
function authMiddleware(req, res, next) {
  const token = req.headers['authorization'];
  if (token === AUTH_TOKEN) {
    return next();
  }
  res.status(401).json({ message: "Unauthorized" });
}

// Route to collect application data
app.post('/api/apply', (req, res) => {
  const application = req.body;

  const stmt = db.prepare(`
    INSERT INTO applications (name, email, mobile, gender, degree, experience, howKnow, resume,position)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?,?)
  `);

  stmt.run(
    application.name,
    application.email,
    application.mobile,
    application.gender,
    application.degree,
    application.experience,
    application.howKnow,
    application.resume,
    application.position,
    function (err) {
      if (err) {
        console.error('DB insert error:', err);
        return res.status(500).json({ message: 'Database error' });
      }

      // Send email with application body
      const mailOptions = {
        from: `"Hiring Brightloom" <${process.env.EMAIL_USER}>`,
        to: application.email,
        subject: 'Application Received',
        text: `Dear ${application.name || 'Applicant'},\n\nThank you for applying to [Your Company Name]. We have received your application and will review it soon.\n\nBest regards,\n[Your Company Name] Team`,
        html: `
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
    <title>Application Submitted Successfully</title>
    <style>
      body {
        font-family: Arial, sans-serif;
        background-color: #f4f4f4;
        padding: 0;
        margin: 0;
      }
      .email-wrapper {
        max-width: 600px;
        margin: 40px auto;
        background: #fff;
        border-radius: 10px;
        padding: 30px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.05);
      }
      .logo {
        width: 120px;
        margin-bottom: 20px;
      }
      h2 {
        color: #9e1c18;
      }
      p {
        font-size: 16px;
        color: #555;
        line-height: 1.6;
      }
      .speacil{
          color: #9e1c18;
      }
      .footer {
        font-size: 13px;
        color: #aaa;
        margin-top: 30px;
      }
    </style>
  </head>
  <body>
    <div class="email-wrapper">
      <center>
        <img src="https://res.cloudinary.com/damoxc2du/image/upload/w_1000,ar_1:1,c_fill,g_auto,e_art:hokusai/v1747136395/LM_1_dgmtls.jpg" alt="Company Logo" class="logo" />
      </center>

      <h2>Application Submitted Successfully</h2>
      <p>Dear ${application.name || 'Applicant'},</p>
      <p>Thank you for applying to <strong class="speacil">Brightloom</strong>. We have successfully received your application. Our team will review your submission and get back to you if your qualifications match our requirements.</p>

      <p><strong class="speacil">Best regards,</strong><br/>Brightloom Hiring Team</p>

      <div class="footer">
        © 2025 Brightloom. All rights reserved.
      </div>
    </div>
  </body>
  </html>
  `
      };

      transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
          console.error('Email send error:', error);
          return res.status(200).json({ message: 'Application received, but failed to send email', id: this.lastID });
        }
        res.status(200).json({ message: 'Application received', id: this.lastID });
      });
    }
  );

  stmt.finalize();
});

// Get all applications (protected)
app.get('/api/applications', authMiddleware, (req, res) => {
  db.all('SELECT * FROM applications ORDER BY submitted_at DESC', [], (err, rows) => {
    if (err) {
      console.error('DB fetch error:', err);
      return res.status(500).json({ message: 'Database error' });
    }
    res.json(rows);
  });
});


app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
