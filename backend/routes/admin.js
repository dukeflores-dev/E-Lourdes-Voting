const express = require('express');
const bcrypt = require('bcrypt');
const path = require('path');
const nodemailer = require('nodemailer');
const router = express.Router();
const { db } = require('../database');
const { requireAdmin } = require('../middleware/adminMiddleware');

router.use(requireAdmin);

// ─── STATS ───────────────────────────────────────────────────────────────────
router.get('/stats', (req, res) => {
  const totalVoters = db.prepare("SELECT COUNT(*) as c FROM users WHERE role='voter'").get().c;
  const totalVotes  = db.prepare("SELECT COUNT(DISTINCT user_id) as c FROM votes").get().c;
  const activeElection = db.prepare("SELECT * FROM elections WHERE status='active' LIMIT 1").get();
  const totalElections = db.prepare("SELECT COUNT(*) as c FROM elections").get().c;
  const totalCandidates = db.prepare("SELECT COUNT(*) as c FROM candidates").get().c;
  res.json({ totalVoters, totalVotes, activeElection, totalElections, totalCandidates });
});

// ─── ELECTIONS ────────────────────────────────────────────────────────────────
router.get('/elections', (req, res) => {
  const elections = db.prepare('SELECT * FROM elections ORDER BY created_at DESC').all();
  res.json(elections);
});

router.get('/elections/:id', (req, res) => {
  const election = db.prepare('SELECT * FROM elections WHERE id = ?').get(req.params.id);
  if (!election) return res.status(404).json({ error: 'Election not found' });
  const positions = db.prepare('SELECT * FROM positions WHERE election_id = ? ORDER BY sort_order').all(election.id);
  for (const pos of positions) {
    pos.candidates = db.prepare('SELECT * FROM candidates WHERE position_id = ? ORDER BY sort_order').all(pos.id);
  }
  res.json({ ...election, positions });
});

router.post('/elections', (req, res) => {
  const { title, description, start_at, end_at } = req.body;
  if (!title) return res.status(400).json({ error: 'Title is required' });
  const result = db.prepare(
    'INSERT INTO elections (title, description, start_at, end_at) VALUES (?, ?, ?, ?)'
  ).run(title, description || null, start_at || null, end_at || null);
  db.prepare('INSERT INTO audit_log (user_id, action, detail, ip_address) VALUES (?, ?, ?, ?)').run(
    req.session.user.id, 'CREATE_ELECTION', `Created election "${title}"`, req.ip
  );
  res.json({ success: true, id: result.lastInsertRowid });
});

router.put('/elections/:id', (req, res) => {
  const { title, description, start_at, end_at } = req.body;
  const election = db.prepare('SELECT * FROM elections WHERE id = ?').get(req.params.id);
  if (!election) return res.status(404).json({ error: 'Election not found' });
  if (election.status === 'ended') return res.status(400).json({ error: 'Cannot edit an ended election' });
  db.prepare(
    'UPDATE elections SET title=?, description=?, start_at=?, end_at=? WHERE id=?'
  ).run(title || election.title, description ?? election.description, start_at ?? election.start_at, end_at ?? election.end_at, election.id);
  res.json({ success: true });
});

router.delete('/elections/:id', (req, res) => {
  const election = db.prepare('SELECT * FROM elections WHERE id = ?').get(req.params.id);
  if (!election) return res.status(404).json({ error: 'Election not found' });
  if (election.status === 'active') return res.status(400).json({ error: 'Cannot delete an active election' });
  db.prepare('DELETE FROM elections WHERE id = ?').run(req.params.id);
  db.prepare('INSERT INTO audit_log (user_id, action, detail, ip_address) VALUES (?, ?, ?, ?)').run(
    req.session.user.id, 'DELETE_ELECTION', `Deleted election "${election.title}"`, req.ip
  );
  res.json({ success: true });
});

router.post('/elections/:id/activate', (req, res) => {
  const election = db.prepare('SELECT * FROM elections WHERE id = ?').get(req.params.id);
  if (!election) return res.status(404).json({ error: 'Election not found' });
  if (election.start_at && new Date(election.start_at) > new Date()) {
    return res.status(400).json({ error: 'Election cannot be activated before its start date' });
  }
  if (election.end_at && new Date(election.end_at) <= new Date()) {
    return res.status(400).json({ error: 'Election end date must be in the future' });
  }
  const positionCount = db.prepare('SELECT COUNT(*) as c FROM positions WHERE election_id = ?').get(election.id).c;
  const emptyPosition = db.prepare(`
    SELECT p.title FROM positions p
    LEFT JOIN candidates c ON c.position_id = p.id
    WHERE p.election_id = ?
    GROUP BY p.id
    HAVING COUNT(c.id) = 0
    LIMIT 1
  `).get(election.id);
  if (positionCount === 0 || emptyPosition) {
    return res.status(400).json({ error: emptyPosition ? `Position "${emptyPosition.title}" needs at least one candidate` : 'Add at least one position before activating' });
  }
  // Deactivate any other active elections
  db.prepare("UPDATE elections SET status='ended' WHERE status='active'").run();
  db.prepare("UPDATE elections SET status='active' WHERE id=?").run(req.params.id);
  db.prepare('INSERT INTO audit_log (user_id, action, detail, ip_address) VALUES (?, ?, ?, ?)').run(
    req.session.user.id, 'ACTIVATE_ELECTION', `Activated election "${election.title}"`, req.ip
  );
  res.json({ success: true });
});

router.post('/elections/:id/end', (req, res) => {
  const election = db.prepare('SELECT * FROM elections WHERE id = ?').get(req.params.id);
  if (!election) return res.status(404).json({ error: 'Election not found' });
  db.prepare("UPDATE elections SET status='ended' WHERE id=?").run(req.params.id);
  db.prepare('INSERT INTO audit_log (user_id, action, detail, ip_address) VALUES (?, ?, ?, ?)').run(
    req.session.user.id, 'END_ELECTION', `Ended election "${election.title}"`, req.ip
  );
  res.json({ success: true });
});

router.post('/elections/:id/reset', (req, res) => {
  const election = db.prepare('SELECT * FROM elections WHERE id = ?').get(req.params.id);
  if (!election) return res.status(404).json({ error: 'Election not found' });
  db.prepare("UPDATE elections SET status='draft' WHERE id=?").run(req.params.id);
  db.prepare('DELETE FROM votes WHERE election_id = ?').run(req.params.id);
  res.json({ success: true });
});

// ─── POSITIONS ────────────────────────────────────────────────────────────────
router.get('/positions', (req, res) => {
  const { electionId } = req.query;
  if (!electionId) return res.status(400).json({ error: 'electionId is required' });
  const positions = db.prepare('SELECT * FROM positions WHERE election_id = ? ORDER BY sort_order').all(electionId);
  res.json(positions);
});

router.post('/positions', (req, res) => {
  const { election_id, title, max_votes, sort_order } = req.body;
  if (!election_id || !title) return res.status(400).json({ error: 'election_id and title are required' });
  const result = db.prepare(
    'INSERT INTO positions (election_id, title, max_votes, sort_order) VALUES (?, ?, ?, ?)'
  ).run(election_id, title, max_votes || 1, sort_order || 0);
  res.json({ success: true, id: result.lastInsertRowid });
});

router.put('/positions/:id', (req, res) => {
  const { title, max_votes, sort_order } = req.body;
  const pos = db.prepare('SELECT * FROM positions WHERE id = ?').get(req.params.id);
  if (!pos) return res.status(404).json({ error: 'Position not found' });
  db.prepare('UPDATE positions SET title=?, max_votes=?, sort_order=? WHERE id=?')
    .run(title || pos.title, max_votes ?? pos.max_votes, sort_order ?? pos.sort_order, pos.id);
  res.json({ success: true });
});

router.delete('/positions/:id', (req, res) => {
  db.prepare('DELETE FROM positions WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ─── CANDIDATES ───────────────────────────────────────────────────────────────
router.get('/candidates', (req, res) => {
  const { positionId } = req.query;
  if (!positionId) return res.status(400).json({ error: 'positionId is required' });
  const candidates = db.prepare('SELECT * FROM candidates WHERE position_id = ? ORDER BY sort_order').all(positionId);
  res.json(candidates);
});

router.post('/candidates', (req, res) => {
  const { position_id, name, bio, party, sort_order } = req.body;
  if (!position_id || !name) return res.status(400).json({ error: 'position_id and name are required' });

  let photo_url = null;
  if (req.files && req.files.photo) {
    const photo = req.files.photo;
    const ext = path.extname(photo.name);
    const filename = `candidate_${Date.now()}${ext}`;
    const uploadPath = path.join(__dirname, '..', 'uploads', filename);
    photo.mv(uploadPath);
    photo_url = `/uploads/${filename}`;
  }

  const result = db.prepare(
    'INSERT INTO candidates (position_id, name, photo_url, bio, party, sort_order) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(position_id, name, photo_url, bio || null, party || null, sort_order || 0);

  res.json({ success: true, id: result.lastInsertRowid });
});

router.put('/candidates/:id', (req, res) => {
  const { name, bio, party, sort_order } = req.body;
  const cand = db.prepare('SELECT * FROM candidates WHERE id = ?').get(req.params.id);
  if (!cand) return res.status(404).json({ error: 'Candidate not found' });

  let photo_url = cand.photo_url;
  if (req.files && req.files.photo) {
    const photo = req.files.photo;
    const ext = path.extname(photo.name);
    const filename = `candidate_${Date.now()}${ext}`;
    const uploadPath = path.join(__dirname, '..', 'uploads', filename);
    photo.mv(uploadPath);
    photo_url = `/uploads/${filename}`;
  }

  db.prepare('UPDATE candidates SET name=?, photo_url=?, bio=?, party=?, sort_order=? WHERE id=?')
    .run(name || cand.name, photo_url, bio ?? cand.bio, party ?? cand.party, sort_order ?? cand.sort_order, cand.id);

  res.json({ success: true });
});

router.delete('/candidates/:id', (req, res) => {
  db.prepare('DELETE FROM candidates WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ─── VOTERS ───────────────────────────────────────────────────────────────────
router.get('/voters', (req, res) => {
  const { search } = req.query;
  let voters;
  if (search) {
    voters = db.prepare(
      "SELECT id, student_id, name, email, is_active, created_at FROM users WHERE role='voter' AND (student_id LIKE ? OR name LIKE ? OR email LIKE ?) ORDER BY name"
    ).all(`%${search}%`, `%${search}%`, `%${search}%`);
  } else {
    voters = db.prepare("SELECT id, student_id, name, email, is_active, created_at FROM users WHERE role='voter' ORDER BY name").all();
  }
  // Add hasVoted flag
  for (const voter of voters) {
    voter.vote_count = db.prepare("SELECT COUNT(DISTINCT election_id) as c FROM votes WHERE user_id=?").get(voter.id).c;
  }
  res.json(voters);
});

router.post('/voters', (req, res) => {
  const { student_id, name, email, password } = req.body;
  if (!student_id || !name || !password) {
    return res.status(400).json({ error: 'student_id, name, and password are required' });
  }
  const exists = db.prepare('SELECT id FROM users WHERE student_id = ?').get(student_id);
  if (exists) return res.status(409).json({ error: 'Student ID already exists' });

  const hash = bcrypt.hashSync(password, 10);
  const result = db.prepare(
    'INSERT INTO users (student_id, name, email, password_hash, role) VALUES (?, ?, ?, ?, ?)'
  ).run(student_id, name, email || null, hash, 'voter');

  db.prepare('INSERT INTO audit_log (user_id, action, detail, ip_address) VALUES (?, ?, ?, ?)').run(
    req.session.user.id, 'CREATE_VOTER', `Created voter "${name}" (${student_id})`, req.ip
  );
  res.json({ success: true, id: result.lastInsertRowid });
});

router.put('/voters/:id', (req, res) => {
  const { name, email, is_active } = req.body;
  const voter = db.prepare("SELECT * FROM users WHERE id = ? AND role='voter'").get(req.params.id);
  if (!voter) return res.status(404).json({ error: 'Voter not found' });
  db.prepare('UPDATE users SET name=?, email=?, is_active=? WHERE id=?')
    .run(name || voter.name, email ?? voter.email, is_active ?? voter.is_active, voter.id);
  res.json({ success: true });
});

router.delete('/voters/:id', (req, res) => {
  const voter = db.prepare("SELECT * FROM users WHERE id = ? AND role='voter'").get(req.params.id);
  if (!voter) return res.status(404).json({ error: 'Voter not found' });
  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  db.prepare('INSERT INTO audit_log (user_id, action, detail, ip_address) VALUES (?, ?, ?, ?)').run(
    req.session.user.id, 'DELETE_VOTER', `Deleted voter "${voter.name}"`, req.ip
  );
  res.json({ success: true });
});

router.post('/voters/reset-password/:id', (req, res) => {
  const { new_password } = req.body;
  if (!new_password || new_password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }
  const voter = db.prepare("SELECT * FROM users WHERE id = ? AND role='voter'").get(req.params.id);
  if (!voter) return res.status(404).json({ error: 'Voter not found' });
  const hash = bcrypt.hashSync(new_password, 10);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, voter.id);
  db.prepare('INSERT INTO audit_log (user_id, action, detail, ip_address) VALUES (?, ?, ?, ?)').run(
    req.session.user.id, 'RESET_PASSWORD', `Reset password for "${voter.name}"`, req.ip
  );
  res.json({ success: true });
});

router.post('/voters/import', (req, res) => {
  const { voters } = req.body; // Array of { student_id, name, email, password }
  if (!Array.isArray(voters) || voters.length === 0) {
    return res.status(400).json({ error: 'voters array is required' });
  }

  const insert = db.prepare(
    'INSERT OR IGNORE INTO users (student_id, name, email, password_hash, role) VALUES (?, ?, ?, ?, ?)'
  );
  const importMany = db.transaction((list) => {
    let count = 0;
    for (const v of list) {
      if (!v.student_id || !v.name || !v.password) continue;
      const hash = bcrypt.hashSync(v.password, 10);
      const result = insert.run(v.student_id, v.name, v.email || null, hash, 'voter');
      if (result.changes > 0) count++;
    }
    return count;
  });

  const count = importMany(voters);
  db.prepare('INSERT INTO audit_log (user_id, action, detail, ip_address) VALUES (?, ?, ?, ?)').run(
    req.session.user.id, 'IMPORT_VOTERS', `Imported ${count} voters`, req.ip
  );
  res.json({ success: true, imported: count });
});

// ─── EMAIL NOTIFY ─────────────────────────────────────────────────────────────
router.post('/notify/:electionId', async (req, res) => {
  const election = db.prepare('SELECT * FROM elections WHERE id = ?').get(req.params.electionId);
  if (!election) return res.status(404).json({ error: 'Election not found' });

  const voters = db.prepare("SELECT * FROM users WHERE role='voter' AND is_active=1 AND email IS NOT NULL").all();
  if (voters.length === 0) return res.status(400).json({ error: 'No voters with email addresses found' });

  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    return res.status(400).json({ error: 'Email not configured. Please set SMTP settings in your .env file.' });
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  });

  let sent = 0;
  for (const voter of voters) {
    try {
      await transporter.sendMail({
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to: voter.email,
        subject: `🗳️ ${election.title} - Now Open for Voting`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: linear-gradient(135deg, #6366f1, #8b5cf6); padding: 30px; text-align: center; border-radius: 12px 12px 0 0;">
              <h1 style="color: white; margin: 0;">🗳️ Lourdes College</h1>
              <p style="color: rgba(255,255,255,0.8); margin: 8px 0 0;">E-Voting System</p>
            </div>
            <div style="background: #f8fafc; padding: 30px; border-radius: 0 0 12px 12px;">
              <h2 style="color: #1e293b;">Dear ${voter.name},</h2>
              <p style="color: #475569;">The election <strong>${election.title}</strong> is now open for voting.</p>
              ${election.description ? `<p style="color: #475569;">${election.description}</p>` : ''}
              <div style="text-align: center; margin: 30px 0;">
                <a href="http://localhost:3000" style="background: linear-gradient(135deg, #6366f1, #8b5cf6); color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold;">
                  Vote Now
                </a>
              </div>
              <p style="color: #94a3b8; font-size: 13px;">Your Student ID: <strong>${voter.student_id}</strong></p>
              <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;">
              <p style="color: #94a3b8; font-size: 12px;">Lourdes College Counseling Department</p>
            </div>
          </div>
        `
      });
      sent++;
    } catch (err) {
      console.error(`Failed to send email to ${voter.email}:`, err.message);
    }
  }

  db.prepare('INSERT INTO audit_log (user_id, action, detail, ip_address) VALUES (?, ?, ?, ?)').run(
    req.session.user.id, 'SEND_NOTIFICATION', `Sent notifications for "${election.title}" to ${sent} voters`, req.ip
  );
  res.json({ success: true, sent, total: voters.length });
});

// ─── AUDIT LOG ────────────────────────────────────────────────────────────────
router.get('/audit', (req, res) => {
  const { limit = 100, offset = 0 } = req.query;
  const logs = db.prepare(`
    SELECT al.*, u.name as user_name, u.student_id
    FROM audit_log al
    LEFT JOIN users u ON al.user_id = u.id
    ORDER BY al.created_at DESC
    LIMIT ? OFFSET ?
  `).all(parseInt(limit), parseInt(offset));
  const total = db.prepare('SELECT COUNT(*) as c FROM audit_log').get().c;
  res.json({ logs, total });
});

module.exports = router;
