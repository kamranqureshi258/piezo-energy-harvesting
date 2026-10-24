import React from 'react';
import { CalendarDays, Clock3, Footprints } from 'lucide-react';

const dayFormatter = new Intl.DateTimeFormat(undefined, {
  weekday: 'long',
  year: 'numeric',
  month: 'long',
  day: 'numeric',
});

const timeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: 'numeric',
  minute: '2-digit',
  second: '2-digit',
});

function localDayKey(value) {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export default function StepHistory({ events = [], currentSteps = 0 }) {
  const groups = events.reduce((byDay, event) => {
    const key = localDayKey(event.observedAt);
    if (!byDay[key]) byDay[key] = [];
    byDay[key].push(event);
    return byDay;
  }, {});
  const days = Object.keys(groups).sort((a, b) => b.localeCompare(a));
  const recordedSteps = events.reduce((sum, event) => sum + event.stepsAdded, 0);

  return (
    <section className="space-y-6" aria-labelledby="step-history-title">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-cyan-300">
            <CalendarDays className="h-5 w-5" />
            <span className="text-xs font-bold uppercase tracking-[0.18em]">Activity log</span>
          </div>
          <h2 id="step-history-title" className="text-2xl font-black text-white">Step History</h2>
          <p className="mt-2 max-w-2xl text-sm text-slate-400">
            Each entry is recorded when live telemetry reports a higher step total. The device sends a cumulative counter, so a batched increase shares one observed time.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:min-w-64">
          <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">Current total</div>
            <div className="mt-1 text-2xl font-black text-white">{Number(currentSteps).toLocaleString()}</div>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">Logged here</div>
            <div className="mt-1 text-2xl font-black text-cyan-300">{recordedSteps.toLocaleString()}</div>
          </div>
        </div>
      </div>

      {days.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-900/60 px-6 py-14 text-center">
          <Footprints className="mx-auto h-10 w-10 text-slate-600" />
          <h3 className="mt-4 text-lg font-bold text-slate-200">No step events recorded yet</h3>
          <p className="mx-auto mt-2 max-w-md text-sm text-slate-400">
            This log starts when this browser receives live telemetry with an increased step counter. Earlier steps do not include timestamps and can’t be reconstructed.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {days.map((day) => {
            const dayEvents = groups[day].slice().sort((a, b) => b.observedAt.localeCompare(a.observedAt));
            const daySteps = dayEvents.reduce((sum, event) => sum + event.stepsAdded, 0);
            const date = new Date(dayEvents[0].observedAt);
            return (
              <section key={day} className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/80">
                <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-5 py-4">
                  <div className="flex items-center gap-3">
                    <CalendarDays className="h-4 w-4 text-cyan-400" />
                    <h3 className="font-bold text-slate-100">{dayFormatter.format(date)}</h3>
                  </div>
                  <span className="rounded-full border border-cyan-500/30 bg-cyan-950/50 px-3 py-1 text-xs font-bold text-cyan-300">
                    {daySteps.toLocaleString()} steps recorded
                  </span>
                </header>
                <div className="divide-y divide-slate-800/80">
                  {dayEvents.map((event) => (
                    <div key={event.id} className="grid grid-cols-[1fr_auto] items-center gap-4 px-5 py-4 sm:grid-cols-[1fr_auto_auto]">
                      <div className="flex min-w-0 items-center gap-3">
                        <Clock3 className="h-4 w-4 shrink-0 text-slate-500" />
                        <time className="truncate text-sm font-medium text-slate-300" dateTime={event.observedAt}>
                          {timeFormatter.format(new Date(event.observedAt))}
                        </time>
                      </div>
                      <span className="text-right text-sm font-bold text-emerald-300">+{event.stepsAdded} {event.stepsAdded === 1 ? 'step' : 'steps'}</span>
                      <span className="col-span-2 text-right text-xs text-slate-500 sm:col-span-1">
                        Counter total: {event.totalSteps.toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </section>
  );
}
