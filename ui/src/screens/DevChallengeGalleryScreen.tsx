import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Header } from '../components/Header';
import { Shell } from '../components/Shell';
import { getAllChallenges } from '../services/challengeBank';
import type { Challenge } from '../types';
import './DevChallengeGalleryScreen.css';

export function DevChallengeGalleryScreen() {
  const navigate = useNavigate();
  const [selected, setSelected] = useState<Challenge | null>(null);
  const challenges = getAllChallenges();

  return (
    <Shell header={<Header title="Challenge Gallery" subtitle="Inspect every bank challenge" />}>
      <div className="gallery-layout">
        <Card className="gallery-list-card" padding="md">
          <h1 className="gallery-title">Development Challenge Gallery</h1>
          <p className="gallery-warning">⚠️ Development-only view. Not part of the production kiosk interface.</p>
          <div className="gallery-groups">
            {(['phishing', 'logs', 'decode'] as const).map((type) => (
              <div key={type} className="gallery-group">
                <h2 className="gallery-group-title">{type === 'phishing' ? '✉️ Phishing Hunt' : type === 'logs' ? '📋 Log Detective' : '▶️ Decode the Flag'}</h2>
                <ul className="gallery-items">
                  {challenges.filter((c) => c.type === type).map((c) => (
                    <li key={c.id}>
                      <button
                        className={`gallery-item ${selected?.id === c.id ? 'active' : ''}`}
                        onClick={() => setSelected(c)}
                      >
                        <span className="gallery-item-title">{c.title}</span>
                        <span className="gallery-item-id">{c.id}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="gallery-actions">
            <Button variant="ghost" fullWidth onClick={() => navigate('/dev-scenarios')}>← Back to scenarios</Button>
            <Button variant="secondary" fullWidth onClick={() => navigate('/')}>Back to home</Button>
          </div>
        </Card>

        <Card className="gallery-detail-card" padding="md">
          {selected ? (
            <div className="gallery-detail">
              <h2 className="gallery-detail-title">{selected.title}</h2>
              <p className="gallery-detail-meta"><strong>ID:</strong> {selected.id} · <strong>Type:</strong> {selected.type}</p>
              <p className="gallery-detail-instruction">{selected.instruction}</p>
              <div className="gallery-detail-section">
                <h3>Hint</h3>
                <p>{selected.hint}</p>
              </div>
              {selected.explanation && (
                <div className="gallery-detail-section">
                  <h3>Explanation</h3>
                  <p>{selected.explanation}</p>
                </div>
              )}
            </div>
          ) : (
            <p className="gallery-empty">Select a challenge from the list to inspect its content, hint, and explanation. Correct answers are not shipped to the client.</p>
          )}
        </Card>
      </div>
    </Shell>
  );
}
