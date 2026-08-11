import { useEffect, useState } from 'react'
import { Check } from 'lucide-react'

// Real per-step server progress isn't available (training is one long
// synchronous call), so this cycles through the actual pipeline stages on a
// timer — still far more informative than a bare spinner with no context,
// and the step labels are accurate (this is really what's happening, just
// without exact timing).
//
// Every caller only mounts this component while the operation is actually
// in flight (`{isPending && <TrainingProgress/>}`), so the timer simply runs
// for the component's lifetime — no separate "active" reset branch needed.
const DEFAULT_STEPS = ['Fetching data', 'Training models', 'Evaluating', 'Saving']

export function TrainingProgress({ active = true, steps = DEFAULT_STEPS, stepDurationMs = 15_000 }) {
  const [stepIndex, setStepIndex] = useState(0)

  useEffect(() => {
    const timer = setInterval(() => {
      setStepIndex(i => Math.min(i + 1, steps.length - 1))
    }, stepDurationMs)
    return () => clearInterval(timer)
  }, [steps.length, stepDurationMs])

  if (!active) return null

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {steps.map((label, i) => {
        const done = i < stepIndex
        const current = i === stepIndex
        return (
          <div key={label} className="flex items-center gap-2">
            <span
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold"
              style={{
                background: done ? 'rgba(34,197,94,.12)' : current ? 'rgba(37,99,235,.12)' : 'var(--surface-muted)',
                color:      done ? 'var(--brand-green)' : current ? 'var(--brand-blue)' : 'var(--text-muted)',
              }}
            >
              {done
                ? <Check className="h-3 w-3" />
                : current
                  ? <span className="h-2.5 w-2.5 rounded-full border-2 border-current border-t-transparent animate-spin" />
                  : <span className="h-1.5 w-1.5 rounded-full bg-current opacity-40" />}
              {label}
            </span>
            {i < steps.length - 1 && <span style={{ color: 'var(--border)' }}>→</span>}
          </div>
        )
      })}
    </div>
  )
}
