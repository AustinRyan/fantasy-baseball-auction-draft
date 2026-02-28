import { useState, useEffect } from 'react';
import { Zap, TrendingUp, DollarSign } from 'lucide-react';
import clsx from 'clsx';
import { draftApi } from '@/api/client';
import { useDraftStore } from '@/store/draftStore';

interface Recommendation {
  player_id: string;
  player_name: string;
  positions: string[];
  recommended_slot: string;
  fair_price: number;
  steal_under: number;
  urgency_score: number;
  urgency_label: string;
  value_over_next_best: number;
  budget_feasible: boolean;
}

function urgencyClass(label?: string) {
  const l = (label ?? '').toLowerCase();
  if (l === 'high') return 'signal-big-overpay';
  if (l === 'medium') return 'signal-overpay';
  return 'signal-steal';
}

export default function DraftRecommendations() {
  const [recs, setRecs] = useState<Recommendation[]>([]);
  const draftActive = useDraftStore((s) => s.draftActive);
  const setSelectedPlayer = useDraftStore((s) => s.setSelectedPlayer);
  const players = useDraftStore((s) => s.players);

  useEffect(() => {
    const fetchRecs = async () => {
      try {
        const res = await draftApi.getRecommendations();
        if (Array.isArray(res.data)) setRecs(res.data);
      } catch { /* not available */ }
    };
    fetchRecs();
    if (draftActive) {
      const interval = setInterval(fetchRecs, 10000);
      return () => clearInterval(interval);
    }
  }, [draftActive]);

  const handleTarget = (rec: Recommendation) => {
    const player = players.find((p) => p.id === rec.player_id);
    if (player) setSelectedPlayer(player);
  };

  return (
    <div className="wr-card">
      <div className="wr-card-header">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-gold" />
          <span className="wr-title">Targets</span>
        </div>
      </div>

      {recs.length === 0 ? (
        <div className="p-4 text-sm text-text-muted text-center">
          Recommendations appear once the draft starts.
        </div>
      ) : (
        <div className="p-3 space-y-1.5">
          {recs.slice(0, 8).map((rec, idx) => (
            <div
              key={`${rec.player_id}-${rec.recommended_slot ?? idx}`}
              onClick={() => handleTarget(rec)}
              className="cursor-pointer rounded-sm border border-border bg-dugout p-3 hover:bg-elevated hover:border-border-bright transition-all"
            >
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm text-text-primary">{rec.player_name}</span>
                  <span className="text-[10px] font-mono text-text-muted">{(rec.positions ?? []).join(',')}</span>
                </div>
                <span className={clsx('inline-flex items-center gap-1 rounded-sm px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider', urgencyClass(rec.urgency_label))}>
                  <Zap className="h-2.5 w-2.5" />
                  {rec.urgency_label ?? 'Low'}
                </span>
              </div>

              <div className="flex items-center gap-3 text-[11px]">
                <span className="flex items-center gap-1 text-text-secondary">
                  <DollarSign className="h-3 w-3" />
                  Fair <span className="font-mono font-bold">${rec.fair_price.toFixed(0)}</span>
                </span>
                <span className="flex items-center gap-1 text-steal">
                  Steal &lt; <span className="font-mono font-bold">${rec.steal_under.toFixed(0)}</span>
                </span>
                {rec.value_over_next_best > 0 && (
                  <span className="flex items-center gap-1 text-value">
                    <TrendingUp className="h-3 w-3" />
                    +${rec.value_over_next_best.toFixed(0)}
                  </span>
                )}
                <span className="ml-auto text-[10px] font-mono text-text-muted">
                  {rec.recommended_slot}
                </span>
              </div>

              {!rec.budget_feasible && (
                <div className="mt-1 text-[10px] font-bold text-big-overpay uppercase tracking-wider">Over budget</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
