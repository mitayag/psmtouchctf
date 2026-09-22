import './StepProgress.css';

interface Step {
  id: string;
  number: number;
  label: string;
  sublabel?: string;
  icon: React.ReactNode;
}

interface StepProgressProps {
  steps: Step[];
  activeId: string;
}

export function StepProgress({ steps, activeId }: StepProgressProps) {
  return (
    <nav className="step-progress" aria-label="Game progress">
      {steps.map((step) => {
        const active = step.id === activeId;
        return (
          <div key={step.id} className={`step-item ${active ? 'step-active' : ''}`}>
            <div className="step-number" aria-hidden="true">
              {step.number}
            </div>
            <div className="step-icon" aria-hidden="true">
              {step.icon}
            </div>
            <div className="step-text">
              <span className="step-label">{step.label}</span>
              {step.sublabel && <span className="step-sublabel">{step.sublabel}</span>}
            </div>
          </div>
        );
      })}
    </nav>
  );
}
