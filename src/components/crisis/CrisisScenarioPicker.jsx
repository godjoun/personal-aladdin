/**
 * CrisisScenarioPicker.jsx — 위기 시나리오 선택
 */

import { CRISIS_SCENARIOS } from '../../utils/riskEngine.js'

function CrisisScenarioPicker({
  selectedId = 'all',
  onChange,
  includeAll = true,
  label = '시나리오',
}) {
  return (
    <div className="scenario-picker" role="group" aria-label={label}>
      <span className="scenario-picker__label">{label}</span>
      <div className="scenario-picker__options">
        {includeAll && (
          <button
            type="button"
            className={`scenario-picker__btn${
              selectedId === 'all' ? ' scenario-picker__btn--active' : ''
            }`}
            onClick={() => onChange?.('all')}
          >
            전체
          </button>
        )}
        {CRISIS_SCENARIOS.map((scenario) => (
          <button
            key={scenario.id}
            type="button"
            className={`scenario-picker__btn${
              selectedId === scenario.id ? ' scenario-picker__btn--active' : ''
            }`}
            onClick={() => onChange?.(scenario.id)}
          >
            {scenario.name.replace('형', '')}
          </button>
        ))}
      </div>
    </div>
  )
}

export default CrisisScenarioPicker
