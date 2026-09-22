import { useNavigate } from 'react-router-dom';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Header } from '../components/Header';
import { Shell } from '../components/Shell';
import { SCENARIOS } from '../services/fixtureData';
import { createSession } from '../services/fixtureApi';
import { fixtureApi } from '../services/fixtureApi';
import './DevScenarioScreen.css';

export function DevScenarioScreen() {
  const navigate = useNavigate();

  const run = async (key: string) => {
    fixtureApi.setScenario(key);
    const session = await createSession('TestPlayer', true, 'standard');
    const setup = SCENARIOS[key].setup;
    const updated = setup(session);
    if (key === 'prize-awarded') {
      await fixtureApi.spin(updated.id);
      navigate(`/play/${updated.id}/claim`);
    } else if (key === 'connection-failure' || key === 'stock-unavailable' || key === 'success') {
      navigate(`/play/${updated.id}/prize`);
    } else {
      navigate(`/play/${updated.id}/results`);
    }
  };

  return (
    <Shell header={<Header title="Developer Scenarios" subtitle="Fixture data only — not production" />}>
      <div className="dev-layout">
        <Card className="dev-card" padding="lg">
          <h1 className="dev-title">Development Scenario Selector</h1>
          <p className="dev-warning">⚠️ These controls are for testing Phase 1 only. They are not part of the production kiosk interface.</p>
          <div className="dev-list">
            {Object.entries(SCENARIOS).map(([key, s]) => (
              <div key={key} className="dev-item">
                <div><strong>{s.label}</strong><p>{s.description}</p></div>
                <Button variant="primary" size="sm" onClick={() => run(key)}>Run</Button>
              </div>
            ))}
          </div>
          <Button variant="secondary" fullWidth onClick={() => navigate('/dev-challenges')}>Inspect challenge bank</Button>
          <Button variant="ghost" fullWidth onClick={() => navigate('/')}>Back to home</Button>
        </Card>
      </div>
    </Shell>
  );
}
