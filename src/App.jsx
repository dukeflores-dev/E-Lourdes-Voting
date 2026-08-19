import { useState } from 'react'
import './App.css'
import schoolLogo from '../img/3gDW1HS7_400x400.png'

const candidates = [
  { id: 1, name: 'Mikaela Santos', course: 'BS Nursing · 3rd year', role: 'President', initials: 'MS', color: 'coral', statement: 'A more connected Lourdes, led with empathy and action.' },
  { id: 2, name: 'Joshua Lim', course: 'BS Information Tech · 2nd year', role: 'President', initials: 'JL', color: 'blue', statement: 'Bringing student ideas from the group chat to the council table.' },
  { id: 3, name: 'Amara Reyes', course: 'BA Communication · 4th year', role: 'Vice President', initials: 'AR', color: 'lilac', statement: 'Making every student voice visible in our campus community.' },
  { id: 4, name: 'Theo Garcia', course: 'BS Accountancy · 3rd year', role: 'Vice President', initials: 'TG', color: 'yellow', statement: 'Practical leadership for a more active student life.' },
]

function App() {
  const [selected, setSelected] = useState([])
  const [submitted, setSubmitted] = useState(false)
  const toggleCandidate = (id) => {
    setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])
    setSubmitted(false)
  }
  const submitBallot = () => { if (selected.length > 0) setSubmitted(true) }

  return (
    <main className="app-shell">
      <nav className="topbar"><a className="brand" href="#top" aria-label="Lourdes student council home"><span className="brand-mark"><img src={schoolLogo} alt="" /></span><span><strong>Our Lady of Lourdes</strong><small>College Student Council</small></span></a><div className="nav-links"><a href="#election">Election</a><a href="#how-it-works">How it works</a><button className="profile-button" type="button">JD <span>Jamie Dela Cruz⌄</span></button></div></nav>
      <section className="hero-section" id="top"><div className="hero-copy"><p className="eyebrow">2025–2026 Student Council Election</p><h1>Your voice shapes<br /><em>our Lourdes.</em></h1><p className="hero-intro">Choose the leaders who will listen, act, and make campus feel more like home.</p><div className="hero-actions"><a className="primary-button" href="#election">Start voting <span>↗</span></a><a className="text-button" href="#how-it-works">Learn about the process <span>→</span></a></div></div><div className="hero-art"><div className="sun" /><div className="paper-note note-one">listen<br /><span>→</span></div><div className="paper-note note-two">make it<br />matter</div><img className="hero-seal" src={schoolLogo} alt="Our Lady of Lourdes College seal" /><div className="star">✦</div></div></section>
      <section className="status-strip"><div><span className="live-dot" /><strong>Voting is live</strong><span>Closes Friday, 14 March at 5:00 PM</span></div><div className="countdown"><span>TIME LEFT</span><strong>02 : 14 : 36</strong></div></section>
      <section className="election-section" id="election"><div className="section-heading"><div><p className="eyebrow">The ballot</p><h2>Meet your candidates</h2></div><p className="helper">Select one candidate per position.<br />You can review before submitting.</p></div><div className="position-label"><span>01</span><h3>President</h3><span className="line" /><span className="required">1 choice required</span></div><div className="candidate-grid">{candidates.slice(0, 2).map((candidate) => <CandidateCard key={candidate.id} candidate={candidate} selected={selected.includes(candidate.id)} onSelect={toggleCandidate} />)}</div><div className="position-label second"><span>02</span><h3>Vice President</h3><span className="line" /><span className="required">1 choice required</span></div><div className="candidate-grid">{candidates.slice(2).map((candidate) => <CandidateCard key={candidate.id} candidate={candidate} selected={selected.includes(candidate.id)} onSelect={toggleCandidate} />)}</div></section>
      <section className="how-section" id="how-it-works"><div><p className="eyebrow">A considered vote</p><h2>Take a minute.<br /><em>Make it count.</em></h2></div><div className="steps"><div><span>01</span><strong>Explore</strong><p>Read each candidate's statement and priorities.</p></div><div><span>02</span><strong>Choose</strong><p>Select one candidate for each position.</p></div><div><span>03</span><strong>Submit</strong><p>Review your ballot, then cast your vote securely.</p></div></div></section>
      <footer><span>© 2025 Our Lady of Lourdes College</span><span>Student Council Elections Office · <a href="mailto:elections@ollc.edu">Need help?</a></span></footer>
      <div className={`ballot-bar ${selected.length ? 'visible' : ''}`}><span>{submitted ? 'Ballot submitted. Thank you for participating.' : `${selected.length} selection${selected.length === 1 ? '' : 's'} ready to review`}</span>{!submitted && <button type="button" onClick={submitBallot}>Review ballot <span>→</span></button>}</div>
    </main>
  )
}

function CandidateCard({ candidate, selected, onSelect }) {
  return <article className={`candidate-card ${selected ? 'selected' : ''}`}><div className={`portrait ${candidate.color}`}><span>{candidate.initials}</span><i>✦</i></div><div className="candidate-info"><p className="candidate-role">{candidate.role}</p><h4>{candidate.name}</h4><p>{candidate.course}</p><blockquote>“{candidate.statement}”</blockquote><button type="button" className="select-button" onClick={() => onSelect(candidate.id)}>{selected ? 'Selected ✓' : 'Select candidate'}<span>{selected ? '' : '＋'}</span></button></div></article>
}

export default App
