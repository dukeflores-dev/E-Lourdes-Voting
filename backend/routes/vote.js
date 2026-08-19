const express = require('express');
const router = express.Router();
const { db } = require('../database');
const { requireAuth } = require('../middleware/authMiddleware');

router.use(requireAuth);

// GET /api/vote/active - get active election with ballot
router.get('/active', (req, res) => {
  const election = db.prepare("SELECT * FROM elections WHERE status='active' LIMIT 1").get();
  if (!election) return res.json({ election: null });

  const positions = db.prepare('SELECT * FROM positions WHERE election_id = ? ORDER BY sort_order').all(election.id);
  for (const pos of positions) {
    pos.candidates = db.prepare('SELECT * FROM candidates WHERE position_id = ? ORDER BY sort_order').all(pos.id);
  }

  // Check which positions user has already voted in
  const userVotes = db.prepare('SELECT position_id, candidate_id FROM votes WHERE user_id = ? AND election_id = ?')
    .all(req.session.user.id, election.id);
  const votedPositions = {};
  for (const v of userVotes) {
    votedPositions[v.position_id] = v.candidate_id;
  }

  res.json({ election: { ...election, positions }, votedPositions });
});

// GET /api/vote/status/:electionId - check voting status for current user
router.get('/status/:electionId', (req, res) => {
  const election = db.prepare('SELECT * FROM elections WHERE id = ?').get(req.params.electionId);
  if (!election) return res.status(404).json({ error: 'Election not found' });

  const positions = db.prepare('SELECT id FROM positions WHERE election_id = ?').all(election.id);
  const votes = db.prepare('SELECT position_id, candidate_id FROM votes WHERE user_id = ? AND election_id = ?')
    .all(req.session.user.id, election.id);

  const hasFullyVoted = positions.length > 0 && votes.length === positions.length;
  res.json({
    electionId: election.id,
    totalPositions: positions.length,
    votedCount: votes.length,
    hasFullyVoted,
    votes
  });
});

// POST /api/vote/cast - cast votes
router.post('/cast', (req, res) => {
  const { election_id, votes } = req.body;

  if (!election_id || !Array.isArray(votes) || votes.length === 0) {
    return res.status(400).json({ error: 'election_id and votes array are required' });
  }

  const election = db.prepare("SELECT * FROM elections WHERE id = ? AND status='active'").get(election_id);
  if (!election) return res.status(400).json({ error: 'Election is not active or does not exist' });

  const positions = db.prepare('SELECT id, title FROM positions WHERE election_id = ?').all(election_id);
  if (positions.length === 0 || votes.length !== positions.length) {
    return res.status(400).json({ error: 'A vote is required for every position' });
  }
  const positionIds = new Set(positions.map(position => position.id));
  const submittedPositionIds = new Set();

  // Validate all votes before inserting any
  for (const vote of votes) {
    if (!vote.position_id || !vote.candidate_id) {
      return res.status(400).json({ error: 'Each vote must have position_id and candidate_id' });
    }

    if (submittedPositionIds.has(Number(vote.position_id))) {
      return res.status(400).json({ error: 'Each position may only be selected once' });
    }
    submittedPositionIds.add(Number(vote.position_id));

    // Check position belongs to election
    if (!positionIds.has(Number(vote.position_id))) {
      return res.status(400).json({ error: `Position ${vote.position_id} does not belong to this election` });
    }
    const position = db.prepare('SELECT * FROM positions WHERE id = ? AND election_id = ?')
      .get(vote.position_id, election_id);
    if (!position) {
      return res.status(400).json({ error: `Position ${vote.position_id} does not belong to this election` });
    }

    // Check candidate belongs to position
    const candidate = db.prepare('SELECT * FROM candidates WHERE id = ? AND position_id = ?')
      .get(vote.candidate_id, vote.position_id);
    if (!candidate) {
      return res.status(400).json({ error: `Candidate ${vote.candidate_id} does not belong to position ${vote.position_id}` });
    }

    // Check if user already voted in this position
    const alreadyVoted = db.prepare('SELECT id FROM votes WHERE user_id = ? AND election_id = ? AND position_id = ?')
      .get(req.session.user.id, election_id, vote.position_id);
    if (alreadyVoted) {
      return res.status(409).json({ error: `You have already voted for position ${position.title}` });
    }
  }

  // Insert all votes in a transaction
  const insertVote = db.prepare(
    'INSERT INTO votes (user_id, election_id, position_id, candidate_id) VALUES (?, ?, ?, ?)'
  );
  const castAll = db.transaction((voteList) => {
    for (const vote of voteList) {
      insertVote.run(req.session.user.id, election_id, vote.position_id, vote.candidate_id);
    }
  });

  try {
    castAll(votes);
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'You have already voted in this election' });
    }
    throw err;
  }

  // Audit log (log only that user voted, not WHO they voted for to preserve anonymity)
  db.prepare('INSERT INTO audit_log (user_id, action, detail, ip_address) VALUES (?, ?, ?, ?)').run(
    req.session.user.id, 'VOTE_CAST',
    `Voted in election "${election.title}" (${votes.length} position(s))`, req.ip
  );

  // Emit real-time results update
  if (req.io) {
    const results = getResultsForElection(election_id);
    req.io.emit('results-update', { electionId: election_id, results });
  }

  res.json({ success: true, message: 'Your vote has been recorded successfully!' });
});

function getResultsForElection(electionId) {
  const positions = db.prepare('SELECT * FROM positions WHERE election_id = ? ORDER BY sort_order').all(electionId);
  for (const pos of positions) {
    const candidates = db.prepare('SELECT * FROM candidates WHERE position_id = ? ORDER BY sort_order').all(pos.id);
    const totalVotes = db.prepare('SELECT COUNT(*) as c FROM votes WHERE position_id = ?').get(pos.id).c;
    pos.candidates = candidates.map(c => ({
      ...c,
      votes: db.prepare('SELECT COUNT(*) as c FROM votes WHERE candidate_id = ?').get(c.id).c,
      percentage: totalVotes > 0
        ? Math.round((db.prepare('SELECT COUNT(*) as c FROM votes WHERE candidate_id = ?').get(c.id).c / totalVotes) * 100)
        : 0
    }));
    pos.totalVotes = totalVotes;
  }
  return positions;
}

module.exports = router;
