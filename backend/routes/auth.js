const express = require('express');
const bcrypt = require('bcrypt');
const router = express.Router();
const { db } = require('../database');

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { student_id, password } = req.body;
  if (!student_id || !password) {
    return res.status(400).json({ error: 'Student ID and password are required' });
  }

  const user = db.prepare('SELECT * FROM users WHERE student_id = ? AND is_active = 1').get(student_id.trim());
  if (!user) {
    return res.status(401).json({ error: 'Invalid Student ID or password' });
  }

  const valid = bcrypt.compareSync(password, user.password_hash);
  if (!valid) {
    return res.status(401).json({ error: 'Invalid Student ID or password' });
  }

  db.prepare('INSERT INTO audit_log (user_id, action, detail, ip_address) VALUES (?, ?, ?, ?)').run(
    user.id, 'LOGIN', `User "${user.name}" logged in`, req.ip
  );

  req.session.user = {
    id: user.id,
    student_id: user.student_id,
    name: user.name,
    email: user.email,
    role: user.role
  };

  res.json({ success: true, user: req.session.user });
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  if (req.session.user) {
    db.prepare('INSERT INTO audit_log (user_id, action, ip_address) VALUES (?, ?, ?)').run(
      req.session.user.id, 'LOGOUT', req.ip
    );
  }
  req.session.destroy(() => {
    res.json({ success: true });
  });
});

// GET /api/auth/me
router.get('/me', (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  res.json({ user: req.session.user });
});

// POST /api/auth/change-password
router.post('/change-password', (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  const { current_password, new_password } = req.body;
  if (!current_password || !new_password) {
    return res.status(400).json({ error: 'Both current and new password are required' });
  }
  if (new_password.length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters' });
  }

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.user.id);
  if (!bcrypt.compareSync(current_password, user.password_hash)) {
    return res.status(401).json({ error: 'Current password is incorrect' });
  }

  const newHash = bcrypt.hashSync(new_password, 10);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(newHash, user.id);

  db.prepare('INSERT INTO audit_log (user_id, action, ip_address) VALUES (?, ?, ?)').run(
    user.id, 'CHANGE_PASSWORD', req.ip
  );

  res.json({ success: true, message: 'Password changed successfully' });
});

module.exports = router;
