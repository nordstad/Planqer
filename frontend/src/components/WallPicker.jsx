import { useTranslation } from 'react-i18next';
import { letterOf } from '../utils/wallpaperPlan';

const WallPicker = ({ walls, value, onChange }) => {
  const { t } = useTranslation();
  const indexes = walls.flatMap((wall, index) => wall.skip ? [] : [index]);
  const moveSelection = (event, direction) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const current = indexes.indexOf(value);
    const next = indexes[(current + direction + indexes.length) % indexes.length];
    onChange(next);
    event.currentTarget.parentElement.querySelectorAll('[role="radio"]')[indexes.indexOf(next)]?.focus();
  };

  return <div className="wall-picker" role="radiogroup" aria-label={t('wallpaperUi.wallPickerLabel')}>
    {walls.map((wall, index) => wall.skip ? null : (
      <button key={index} type="button" role="radio" aria-checked={index === value}
        className={`wall-picker-tab${index === value ? ' is-active' : ''}`}
        onClick={() => onChange(index)} onKeyDown={(event) => moveSelection(event, event.key === 'ArrowLeft' ? -1 : 1)}>
        <span className="wall-picker-letter" aria-hidden="true">{letterOf(index)}</span>
        <span>{wall.name}</span>
      </button>
    ))}
  </div>;
};

export default WallPicker;
