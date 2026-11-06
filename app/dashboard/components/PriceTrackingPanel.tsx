'use client';

import { useState, useEffect } from 'react';
import { TrendingUp, AlertTriangle, ChevronRight } from 'lucide-react';
import { getPriceAlerts } from '../price-actions';
import PurchasedProductDialog from './PurchasedProductDialog';
import InfoHint from '@/app/components/InfoHint';
import { useLanguage } from '@/lib/language-context';
import { formatMoney } from '@/lib/format';
import type { PriceIncrease } from '@/lib/price-increases';


export default function PriceTrackingPanel() {
  const { t, language } = useLanguage();
  const locale = language === 'pt' ? 'pt-PT' : 'en-GB';
  const [alerts, setAlerts] = useState<PriceIncrease[]>([]);
  const [loading, setLoading] = useState(true);
  /** The product open over the list: every purchase, from every supplier. */
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    loadAlerts();
  }, []);

  async function loadAlerts() {
    setLoading(true);
    const result = await getPriceAlerts();
    if (result.success) {
      setAlerts(result.data);
    }
    setLoading(false);
  }

  return (
    <div className="card-glass p-6">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-amber-400" />
          <h3 className="font-bold text-foreground">{t('priceTracking.title')}<InfoHint term="priceAlert" /></h3>
          {alerts.length > 0 && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 font-medium">
              {alerts.length}
            </span>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-20 text-sm text-muted-foreground">
          {t('priceTracking.loading')}
        </div>
      ) : alerts.length === 0 ? (
        <div className="text-sm text-muted-foreground text-center py-8">
          {t('priceTracking.emptyAny')}
        </div>
      ) : (
        <div className="space-y-2">
          {alerts.map((alert, i) => {
            return (
              <div key={i} className="border border-border-subtle rounded-xl overflow-hidden">
                <button
                  onClick={() => setOpen(alert.normalizedName)}
                  className="w-full flex items-center gap-3 p-3 hover:bg-muted transition-colors text-left"
                >
                  <div className="p-1.5 rounded-lg bg-danger/10">
                    <TrendingUp className="w-4 h-4 text-danger" aria-hidden="true" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-foreground truncate">{alert.productName}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {alert.vendorName || t('priceTracking.unknownVendor')}
                      {' · '}
                      {new Date(`${alert.date}T00:00:00Z`).toLocaleDateString(locale, { timeZone: 'UTC' })}
                    </div>
                    {alert.rises > 1 && (
                      <div className="text-[11px] text-muted-foreground tabular-nums">
                        {t('priceTracking.history')
                          .replace('{rises}', String(alert.rises))
                          .replace('{percent}', `${alert.sinceFirstPercent > 0 ? '+' : ''}${alert.sinceFirstPercent.toLocaleString(locale)}%`)}
                      </div>
                    )}
                  </div>
                  <div className="text-right shrink-0 tabular-nums">
                    <div className="text-sm font-bold text-danger">+{alert.changePercent.toLocaleString(locale)}%</div>
                    <div className="text-[10px] text-muted-foreground">
                      {formatMoney(alert.previousPrice)} → {formatMoney(alert.newPrice)}{alert.unit ? `/${alert.unit}` : ''}
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" aria-hidden="true" />
                </button>

              </div>
            );
          })}
        </div>
      )}

      {open && <PurchasedProductDialog normalizedName={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
