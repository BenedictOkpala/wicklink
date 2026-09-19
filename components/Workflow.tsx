export default function Workflow() {
  return <div className="workflow-bar"><ol aria-label="Research workflow">{['DETECT', 'INVESTIGATE', 'EVIDENCE', 'ASSESS'].map((step, index) => <li key={step} className={index === 0 ? 'current' : ''} aria-current={index === 0 ? 'step' : undefined}><span className="step-index">0{index + 1}</span>{step}{index < 3 && <span className="step-arrow" aria-hidden="true">→</span>}</li>)}</ol><span className="workflow-note">Detection live. Investigation coming next.</span></div>;
}
