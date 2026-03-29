'use client';

import { useState, useEffect } from 'react';
import { ethers } from 'ethers';

declare global {
  interface window {
    ethereum: any;
  }
}

const REGISTRY_ADDRESS = '0xEE66574d63535a344A0b044734fC2Ec0Be2a933d';
const SCORE_ADDRESS = '0x855dA715F3182f9A105343c91F80ba1B435BfD31';

const REGISTRY_ABI = [
  'function register() external',
  'function isRegistered(address wallet) external view returns (bool)',
];

const SCORE_ABI = [
  'function submitReview(address target, uint8 score, string category, string ipfsHash) external',
  'function getScore(address wallet) external view returns (uint256)',
  'function getReviews(address wallet) external view returns (tuple(address reviewer, uint8 score, string category, string ipfsHash, uint256 timestamp)[])',
];

function shortAddress(addr: string) {
  return addr ? addr.slice(0, 6) + '...' + addr.slice(-4) : '';
}

function getBadge(score: number) {
  if (score >= 900) return { label: 'Diamond', emoji: '💎', color: '#67e8f9', bg: 'rgba(103,232,249,0.1)', border: 'rgba(103,232,249,0.3)' };
  if (score >= 600) return { label: 'Gold', emoji: '🥇', color: '#fbbf24', bg: 'rgba(251,191,36,0.1)', border: 'rgba(251,191,36,0.3)' };
  if (score >= 300) return { label: 'Silver', emoji: '🥈', color: '#cbd5e1', bg: 'rgba(203,213,225,0.1)', border: 'rgba(203,213,225,0.3)' };
  if (score >= 100) return { label: 'Bronze', emoji: '🥉', color: '#fb923c', bg: 'rgba(251,146,60,0.1)', border: 'rgba(251,146,60,0.3)' };
  return { label: 'Unranked', emoji: '◈', color: '#6366f1', bg: 'rgba(99,102,241,0.1)', border: 'rgba(99,102,241,0.3)' };
}

function AnimatedScore({ score }: { score: number }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    let start = 0;
    const step = Math.ceil(score / 40);
    const timer = setInterval(() => {
      start += step;
      if (start >= score) { setDisplay(score); clearInterval(timer); }
      else setDisplay(start);
    }, 30);
    return () => clearInterval(timer);
  }, [score]);

  const pct = Math.min(score / 1000, 1);
  const r = 70;
  const circ = 2 * Math.PI * r;
  const dash = pct * circ;

  return (
    <div className="relative flex items-center justify-center" style={{ width: 180, height: 180 }}>
      <svg width="180" height="180" viewBox="0 0 180 180" className="absolute">
        <defs>
          <linearGradient id="scoreGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#6366f1" />
            <stop offset="100%" stopColor="#06b6d4" />
          </linearGradient>
          <filter id="glow">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        <circle cx="90" cy="90" r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="8" />
        <circle cx="90" cy="90" r={r} fill="none" stroke="url(#scoreGrad)" strokeWidth="8"
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
          transform="rotate(-90 90 90)" filter="url(#glow)"
          style={{ transition: 'stroke-dasharray 1s ease' }} />
      </svg>
      <div className="text-center z-10">
        <div style={{ fontFamily: "'Courier New', monospace", fontSize: 36, fontWeight: 700, color: '#fff', lineHeight: 1 }}>{display}</div>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', letterSpacing: 2, marginTop: 4 }}>REP SCORE</div>
      </div>
    </div>
  );
}

export default function Home() {
  const [account, setAccount] = useState('');
  const [isRegistered, setIsRegistered] = useState(false);
  const [repScore, setRepScore] = useState(0);
  const [reviews, setReviews] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [activeTab, setActiveTab] = useState('dashboard');
  const [targetAddress, setTargetAddress] = useState('');
  const [reviewScore, setReviewScore] = useState(5);
  const [category, setCategory] = useState('freelance');

  async function connectWallet() {
    try {
      const provider = new ethers.BrowserProvider((window as any) .ethereum);
      const accounts = await provider.send('eth_requestAccounts', []);
      const userAddress = accounts[0];
      setAccount(userAddress);
      const registry = new ethers.Contract(REGISTRY_ADDRESS, REGISTRY_ABI, provider);
      const registered = await registry.isRegistered(userAddress);
      setIsRegistered(registered);
      if (registered) loadScore(userAddress, provider);
    } catch { setStatus('Failed to connect wallet'); }
  }

  async function loadScore(address: string, provider: any) {
    try {
      const contract = new ethers.Contract(SCORE_ADDRESS, SCORE_ABI, provider);
      const s = await contract.getScore(address);
      setRepScore(Number(s));
      const r = await contract.getReviews(address);
      setReviews([...r]);
    } catch (e) { console.error(e); }
  }

  async function registerWallet() {
    try {
      setLoading(true);
      const provider = new ethers.BrowserProvider((window as any) .ethereum);
      const signer = await provider.getSigner();
      const registry = new ethers.Contract(REGISTRY_ADDRESS, REGISTRY_ABI, signer);
      const tx = await registry.register();
      setStatus('Registering on-chain...');
      await tx.wait();
      setIsRegistered(true);
      setStatus('');
    } catch (err: any) {
      if (err?.message?.includes('AlreadyRegistered')) setIsRegistered(true);
      else setStatus('Registration failed');
    } finally { setLoading(false); }
  }

  async function submitReview() {
    try {
      setLoading(true); setStatus('');
      const provider = new ethers.BrowserProvider((window as any) .ethereum);
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(SCORE_ADDRESS, SCORE_ABI, signer);
      const tx = await contract.submitReview(targetAddress, reviewScore, category, '');
      setStatus('Broadcasting transaction...');
      await tx.wait();
      setStatus('Review confirmed on-chain ✓');
      setTargetAddress('');
      loadScore(account, provider);
    } catch (err: any) {
      setStatus('Transaction failed');
    } finally { setLoading(false); }
  }

  const badge = getBadge(repScore);

  const styles = {
    page: {
      minHeight: '100vh',
      background: '#080c18',
      color: '#fff',
      fontFamily: "'DM Sans', 'Helvetica Neue', sans-serif",
      backgroundImage: `
        radial-gradient(ellipse 80% 50% at 50% -20%, rgba(99,102,241,0.15) 0%, transparent 60%),
        radial-gradient(ellipse 50% 30% at 80% 80%, rgba(6,182,212,0.08) 0%, transparent 50%)
      `,
    } as React.CSSProperties,
    nav: {
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '20px 32px', borderBottom: '1px solid rgba(255,255,255,0.06)',
      backdropFilter: 'blur(20px)', position: 'sticky' as const, top: 0, zIndex: 50,
      background: 'rgba(8,12,24,0.8)',
    },
    logo: { display: 'flex', alignItems: 'center', gap: 10 },
    logoMark: {
      width: 32, height: 32, borderRadius: 8,
      background: 'linear-gradient(135deg, #6366f1, #06b6d4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 14, fontWeight: 800, color: '#fff',
    },
    logoText: { fontSize: 16, fontWeight: 700, letterSpacing: -0.5 },
    pill: {
      display: 'flex', alignItems: 'center', gap: 8,
      background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
      borderRadius: 100, padding: '8px 16px', fontSize: 13,
    },
    dot: { width: 7, height: 7, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 8px #22c55e' },
    connectBtn: {
      background: 'linear-gradient(135deg, #6366f1, #06b6d4)',
      border: 'none', borderRadius: 10, padding: '10px 20px',
      color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer',
      letterSpacing: 0.3,
    },
    card: {
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 20, padding: 28,
      backdropFilter: 'blur(10px)',
    },
    tab: (active: boolean) => ({
      flex: 1, padding: '10px 0', borderRadius: 10, fontSize: 13, fontWeight: 600,
      cursor: 'pointer', transition: 'all 0.2s', border: 'none',
      background: active ? 'rgba(99,102,241,0.2)' : 'transparent',
      color: active ? '#818cf8' : 'rgba(255,255,255,0.4)',
      borderBottom: active ? '2px solid #6366f1' : '2px solid transparent',
    }),
    input: {
      width: '100%', background: 'rgba(255,255,255,0.04)',
      border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12,
      padding: '14px 16px', color: '#fff', fontSize: 14, outline: 'none',
      boxSizing: 'border-box' as const, fontFamily: 'inherit',
      transition: 'border-color 0.2s',
    },
    submitBtn: {
      width: '100%', padding: '14px',
      background: 'linear-gradient(135deg, #6366f1, #06b6d4)',
      border: 'none', borderRadius: 12, color: '#fff',
      fontWeight: 700, fontSize: 15, cursor: 'pointer',
      letterSpacing: 0.3, transition: 'opacity 0.2s',
    },
  };

  return (
    <div style={styles.page}>

      {/* Google Fonts */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::placeholder { color: rgba(255,255,255,0.25); }
        input:focus, select:focus { border-color: rgba(99,102,241,0.5) !important; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 2px; }
        select option { background: #0f1629; }
      `}</style>

      {/* Navbar */}
      <nav style={styles.nav}>
        <div style={styles.logo}>
          <div style={styles.logoMark}>R</div>
          <span style={styles.logoText}>RepChain</span>
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginLeft: 6, background: 'rgba(255,255,255,0.06)', padding: '2px 8px', borderRadius: 100 }}>POLYGON AMOY</span>
        </div>
        {account ? (
          <div style={styles.pill}>
            <div style={styles.dot} />
            <span style={{ fontFamily: 'monospace', fontSize: 13 }}>{shortAddress(account)}</span>
          </div>
        ) : (
          <button style={styles.connectBtn} onClick={connectWallet}>Connect Wallet</button>
        )}
      </nav>

      {!account ? (
        /* ── Landing ── */
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '85vh', padding: '40px 24px', textAlign: 'center' }}>
          <div style={{ fontSize: 11, letterSpacing: 4, color: '#6366f1', marginBottom: 20, textTransform: 'uppercase', fontWeight: 600 }}>Web3 Reputation Infrastructure</div>
          <h1 style={{ fontSize: 'clamp(40px, 8vw, 72px)', fontWeight: 800, lineHeight: 1.05, letterSpacing: -2, marginBottom: 20, background: 'linear-gradient(135deg, #fff 40%, rgba(255,255,255,0.5))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            Your reputation,<br />on-chain forever.
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 18, maxWidth: 420, lineHeight: 1.6, marginBottom: 40 }}>
            Immutable reviews. Soulbound badges. Trustless identity. Built on Polygon.
          </p>
          <button style={{ ...styles.connectBtn, padding: '16px 36px', fontSize: 16, borderRadius: 14 }} onClick={connectWallet}>
            Get Started →
          </button>

          {/* Feature Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginTop: 64, maxWidth: 560, width: '100%' }}>
            {[
              { icon: '⛓', title: 'On-Chain', desc: 'Stored permanently on Polygon blockchain' },
              { icon: '🔒', title: 'Immutable', desc: 'Reviews cannot be edited or deleted' },
              { icon: '🏅', title: 'Soulbound', desc: 'NFT badges tied to your wallet forever' },
            ].map(f => (
              <div key={f.title} style={{ ...styles.card, textAlign: 'left', padding: 20 }}>
                <div style={{ fontSize: 22, marginBottom: 10 }}>{f.icon}</div>
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6 }}>{f.title}</div>
                <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, lineHeight: 1.5 }}>{f.desc}</div>
              </div>
            ))}
          </div>
        </div>

      ) : !isRegistered ? (
        /* ── Register ── */
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '85vh', padding: 24 }}>
          <div style={{ ...styles.card, maxWidth: 420, width: '100%', textAlign: 'center' }}>
            <div style={{ width: 56, height: 56, borderRadius: 16, background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, margin: '0 auto 20px' }}>◈</div>
            <h2 style={{ fontSize: 24, fontWeight: 800, marginBottom: 8, letterSpacing: -0.5 }}>Register Your Identity</h2>
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14, lineHeight: 1.6, marginBottom: 24 }}>
              Register your wallet to start building your verifiable on-chain reputation.
            </p>
            <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: '12px 16px', marginBottom: 24, fontFamily: 'monospace', fontSize: 13, color: 'rgba(255,255,255,0.5)', wordBreak: 'break-all' }}>
              {account}
            </div>
            <button style={styles.submitBtn} onClick={registerWallet} disabled={loading}>
              {loading ? 'Broadcasting...' : 'Register on RepChain'}
            </button>
            {status && <p style={{ color: '#818cf8', fontSize: 13, marginTop: 16 }}>{status}</p>}
          </div>
        </div>

      ) : (
        /* ── Dashboard ── */
        <div style={{ maxWidth: 680, margin: '0 auto', padding: '32px 24px' }}>

          {/* Score Hero */}
          <div style={{ ...styles.card, marginBottom: 20, background: 'linear-gradient(135deg, rgba(99,102,241,0.08), rgba(6,182,212,0.05))', border: '1px solid rgba(99,102,241,0.2)', display: 'flex', alignItems: 'center', gap: 32, flexWrap: 'wrap' as const }}>
            <AnimatedScore score={repScore} />
            <div style={{ flex: 1 }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: badge.bg, border: `1px solid ${badge.border}`, borderRadius: 100, padding: '6px 14px', marginBottom: 16 }}>
                <span>{badge.emoji}</span>
                <span style={{ color: badge.color, fontWeight: 700, fontSize: 13 }}>{badge.label}</span>
              </div>
              <div style={{ fontFamily: 'monospace', fontSize: 12, color: 'rgba(255,255,255,0.3)', marginBottom: 16, wordBreak: 'break-all' }}>{account}</div>
              <div style={{ display: 'flex', gap: 20 }}>
                <div>
                  <div style={{ fontSize: 22, fontWeight: 800 }}>{reviews.length}</div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', letterSpacing: 1 }}>REVIEWS</div>
                </div>
                <div style={{ width: 1, background: 'rgba(255,255,255,0.08)' }} />
                <div>
                  <div style={{ fontSize: 22, fontWeight: 800 }}>{repScore < 100 ? 100 - repScore : repScore < 300 ? 300 - repScore : repScore < 600 ? 600 - repScore : repScore < 900 ? 900 - repScore : 0}</div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', letterSpacing: 1 }}>TO NEXT TIER</div>
                </div>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 20, background: 'rgba(255,255,255,0.03)', borderRadius: 14, padding: 4 }}>
            {[['dashboard', '◈ Overview'], ['review', '✍ Review'], ['history', '◷ History']].map(([t, l]) => (
              <button key={t} style={styles.tab(activeTab === t)} onClick={() => setActiveTab(t)}>{l}</button>
            ))}
          </div>

          {/* Overview */}
          {activeTab === 'dashboard' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {[
                { label: 'REP SCORE', value: repScore, sub: 'out of 1000' },
                { label: 'REVIEWS', value: reviews.length, sub: 'received' },
                { label: 'CURRENT TIER', value: badge.label, sub: badge.emoji },
                { label: 'NEXT MILESTONE', value: repScore < 100 ? '100' : repScore < 300 ? '300' : repScore < 600 ? '600' : '900', sub: 'points needed' },
              ].map(item => (
                <div key={item.label} style={styles.card}>
                  <div style={{ fontSize: 10, letterSpacing: 2, color: 'rgba(255,255,255,0.35)', marginBottom: 12, fontWeight: 600 }}>{item.label}</div>
                  <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: -1 }}>{item.value}</div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', marginTop: 4 }}>{item.sub}</div>
                </div>
              ))}
            </div>
          )}

          {/* Review Form */}
          {activeTab === 'review' && (
            <div style={styles.card}>
              <h3 style={{ fontSize: 18, fontWeight: 800, marginBottom: 24, letterSpacing: -0.5 }}>Submit a Review</h3>
              <div style={{ marginBottom: 20 }}>
                <label style={{ fontSize: 11, letterSpacing: 2, color: 'rgba(255,255,255,0.4)', fontWeight: 600, display: 'block', marginBottom: 8 }}>WALLET ADDRESS</label>
                <input style={styles.input} type="text" value={targetAddress}
                  onChange={e => setTargetAddress(e.target.value)} placeholder="0x..." />
              </div>
              <div style={{ marginBottom: 20 }}>
                <label style={{ fontSize: 11, letterSpacing: 2, color: 'rgba(255,255,255,0.4)', fontWeight: 600, display: 'block', marginBottom: 8 }}>SCORE</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {[1,2,3,4,5].map(n => (
                    <button key={n} onClick={() => setReviewScore(n)} style={{
                      flex: 1, padding: '14px 0', borderRadius: 12, fontWeight: 800, fontSize: 16, cursor: 'pointer', border: 'none', transition: 'all 0.2s',
                      background: reviewScore === n ? 'linear-gradient(135deg, #6366f1, #06b6d4)' : 'rgba(255,255,255,0.05)',
                      color: reviewScore === n ? '#fff' : 'rgba(255,255,255,0.4)',
                    }}>{n}</button>
                  ))}
                </div>
              </div>
              <div style={{ marginBottom: 24 }}>
                <label style={{ fontSize: 11, letterSpacing: 2, color: 'rgba(255,255,255,0.4)', fontWeight: 600, display: 'block', marginBottom: 8 }}>CATEGORY</label>
                <select style={{ ...styles.input, appearance: 'none' }} value={category} onChange={e => setCategory(e.target.value)}>
                  <option value="freelance">Freelance Work</option>
                  <option value="trade">Trade</option>
                  <option value="dao">DAO Contribution</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <button style={{ ...styles.submitBtn, opacity: loading || !targetAddress ? 0.5 : 1 }}
                onClick={submitReview} disabled={loading || !targetAddress}>
                {loading ? 'Broadcasting...' : 'Submit Review →'}
              </button>
              {status && <p style={{ color: '#818cf8', fontSize: 13, marginTop: 16, textAlign: 'center' }}>{status}</p>}
            </div>
          )}

          {/* History */}
          {activeTab === 'history' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {reviews.length === 0 ? (
                <div style={{ ...styles.card, textAlign: 'center', padding: 48 }}>
                  <div style={{ fontSize: 36, marginBottom: 12 }}>◈</div>
                  <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>No reviews received yet</div>
                  <div style={{ color: 'rgba(255,255,255,0.2)', fontSize: 12, marginTop: 6 }}>Share your wallet to get your first review</div>
                </div>
              ) : reviews.map((r, i) => (
                <div key={i} style={{ ...styles.card, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontFamily: 'monospace', fontSize: 12, color: '#818cf8', marginBottom: 6 }}>{shortAddress(r.reviewer)}</div>
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', textTransform: 'capitalize' }}>{r.category}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 3 }}>
                    {[1,2,3,4,5].map(n => (
                      <div key={n} style={{ width: 8, height: 8, borderRadius: '50%', background: n <= Number(r.score) ? '#6366f1' : 'rgba(255,255,255,0.1)' }} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

        </div>
      )}
    </div>
  );
}
