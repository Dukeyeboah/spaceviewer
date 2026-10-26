"use client";

import {
  QUALITY_PRESETS,
  qualityPresetOrder,
  type QualityPresetId,
} from "@/lib/viewer/experiences/qualityPresets";

type Props = {
  value: QualityPresetId;
  onChange: (id: QualityPresetId) => void;
};

/**
 * Always-visible Performance ↔ Quality lever for Experiences visitors.
 */
export function QualityLever({ value, onChange }: Props) {
  const order = qualityPresetOrder();
  const index = Math.max(0, order.indexOf(value));

  return (
    <div className="exp-quality-lever" role="group" aria-label="Graphics quality">
      <div className="exp-quality-lever-head">
        <span className="exp-quality-lever-label">Graphics</span>
        <span className="exp-quality-lever-value" title={QUALITY_PRESETS[value].note}>
          {QUALITY_PRESETS[value].label}
        </span>
      </div>
      <input
        className="exp-quality-lever-range"
        type="range"
        min={0}
        max={order.length - 1}
        step={1}
        value={index}
        aria-valuetext={QUALITY_PRESETS[value].label}
        onChange={(e) => {
          const next = order[Number(e.target.value)] ?? value;
          onChange(next);
        }}
      />
      <div className="exp-quality-lever-ticks" aria-hidden>
        {order.map((id) => (
          <button
            key={id}
            type="button"
            className={value === id ? "on" : ""}
            onClick={() => onChange(id)}
            title={QUALITY_PRESETS[id].note}
          >
            {QUALITY_PRESETS[id].label}
          </button>
        ))}
      </div>
    </div>
  );
}
