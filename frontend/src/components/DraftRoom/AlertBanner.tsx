import { useState, useEffect, useRef } from 'react';
import clsx from 'clsx';
import { draftApi } from '@/api/client';

interface Alert {
  id: string;
  player_name: string;
  team_id: string;
  price: number;
  classification: string;
}

function classificationSignal(classification: string) {
  const c = classification.toLowerCase();
  if (c.includes('big steal') || c === 'steal') return 'signal-steal';
  if (c === 'value') return 'signal-value';
  if (c === 'fair') return 'signal-fair';
  if (c.includes('big overpay')) return 'signal-big-overpay';
  if (c === 'overpay') return 'signal-overpay';
  return 'signal-fair';
}

export default function AlertBanner() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchAlerts = async () => {
      try {
        const res = await draftApi.getAlerts();
        if (Array.isArray(res.data)) setAlerts(res.data);
      } catch { /* not available */ }
    };
    fetchAlerts();
    const interval = setInterval(fetchAlerts, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollLeft = 0;
  }, [alerts]);

  if (alerts.length === 0) {
    return (
      <div className="wr-card">
        <div className="px-4 py-3 text-sm text-text-muted text-center">
          No picks recorded yet. Start the draft to see the ticker.
        </div>
      </div>
    );
  }

  return (
    <div className="wr-card">
      <div className="px-4 py-2 flex items-center gap-3">
        <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-text-muted whitespace-nowrap">
          Pick Ticker
        </span>
        <div ref={scrollRef} className="flex gap-2 overflow-x-auto pb-0.5 scroll-smooth flex-1">
          {alerts.map((alert) => (
            <div
              key={alert.id}
              className={clsx(
                'flex-shrink-0 rounded-sm px-3 py-2 min-w-[150px] transition-all',
                classificationSignal(alert.classification),
              )}
            >
              <div className="font-medium text-sm truncate">{alert.player_name}</div>
              <div className="flex items-center justify-between mt-0.5">
                <span className="text-[10px] opacity-70">{alert.team_id.replace('team_', 'T')}</span>
                <span className="font-mono font-bold text-sm">${alert.price}</span>
              </div>
              <div className="text-[10px] font-bold uppercase tracking-wider mt-0.5 opacity-80">
                {alert.classification}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
