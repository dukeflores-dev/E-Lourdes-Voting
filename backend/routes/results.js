const express = require('express');
const router = express.Router();
const { db } = require('../database');
const { requireAuth } = require('../middleware/authMiddleware');

router.use(requireAuth);

// GET /api/results/:electionId
router.get('/:electionId', (req, res) => {
  const election = db.prepare('SELECT * FROM elections WHERE id = ?').get(req.params.electionId);
  if (!election) return res.status(404).json({ error: 'Election not found' });

  // Voters can only see results of ended elections or their own after voting
  if (req.session.user.role !== 'admin') {
    if (election.status !== 'ended') {
      const userVoted = db.prepare('SELECT id FROM votes WHERE user_id = ? AND election_id = ? LIMIT 1')
        .get(req.session.user.id, election.id);
      if (!userVoted) {
        return res.status(403).json({ error: 'Results are available after you vote or the election ends' });
      }
    }
  }

  const positions = db.prepare('SELECT * FROM positions WHERE election_id = ? ORDER BY sort_order').all(election.id);
  const totalUniqueVoters = db.prepare('SELECT COUNT(DISTINCT user_id) as c FROM votes WHERE election_id = ?').get(election.id).c;

  for (const pos of positions) {
    const candidates = db.prepare('SELECT * FROM candidates WHERE position_id = ? ORDER BY sort_order').all(pos.id);
    const positionTotalVotes = db.prepare('SELECT COUNT(*) as c FROM votes WHERE position_id = ?').get(pos.id).c;

    pos.candidates = candidates.map(c => {
      const voteCount = db.prepare('SELECT COUNT(*) as c FROM votes WHERE candidate_id = ?').get(c.id).c;
      return {
        ...c,
        votes: voteCount,
        percentage: positionTotalVotes > 0 ? Math.round((voteCount / positionTotalVotes) * 100) : 0
      };
    });

    // Sort by votes descending
    pos.candidates.sort((a, b) => b.votes - a.votes);
    pos.totalVotes = positionTotalVotes;
    pos.winner = pos.candidates.length > 0 ? pos.candidates[0] : null;
  }

  const totalEligibleVoters = db.prepare("SELECT COUNT(*) as c FROM users WHERE role='voter' AND is_active=1").get().c;

  res.json({
    election,
    positions,
    totalUniqueVoters,
    totalEligibleVoters,
    turnout: totalEligibleVoters > 0 ? Math.round((totalUniqueVoters / totalEligibleVoters) * 100) : 0
  });
});

// GET /api/results - list all elections with results (admin only)
router.get('/', (req, res) => {
  const elections = db.prepare('SELECT * FROM elections ORDER BY created_at DESC').all();
  res.json(elections);
});

module.exports = router;
