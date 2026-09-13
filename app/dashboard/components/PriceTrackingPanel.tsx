'use client';

import { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';
import { getPriceAlerts, getProductPriceHistory } from '../price-actions';
import InfoHint from '@/app/components/InfoHint';
import { useLanguage } from '@/lib/language-context';

interface PriceAlert {
  productName: string;
  normalizedName: string;
  vendorName: string | null;
  vendorId: string | null;
  previousPrice: number;
  currentPrice: number;
  changePercent: number;
  invoiceDate: Date | null;
}

interface PricePoint {
  date: Date | null;
  unitPrice: number;
  quantity: number;
  vendor: string | null;
}

export default function PriceTrackingPanel() {
  const { t } = useLanguage();
  const [alerts, setAlerts] = useState<PriceAlert[]>([]);
  const [threshold, setThreshold] = useState(5);
  const [loading, setLoading] = useState(true);
  const [expandedProduct, setExpandedProduct] = useState<string | null>(null);
  const [priceHistory, setPriceHistory] = useState<PricePoint[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  useEffect(() => {
    loadAlerts();
  }, [threshold]);

  async function loadAlerts() {
    setLoading(true);
    const result = await getPriceAlerts(threshold);
    if (result.success) {
      setAlerts(result.data);
    }
    setLoading(false);
  }

  async function toggleHistory(productName: string, vendorId: string | null) {
    const key = `${productName}::${vendorId}`;
    if (expandedProduct === key) {
      setExpandedProduct(null);
      return;
    }

    setExpandedProduct(key);
    setHistoryLoading(true);
    const result = await getProductPriceHistory(productName, vendorId || undefined);
    if (result.success) {
      setPriceHistory(result.data);
    }
    setHistoryLoading(false);
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
        {/* A bare "+5%" dropdown says nothing about what it filters. */}
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span>{t('priceTracking.warnFrom')}<InfoHint term="priceThreshold" /></span>
        <select
          value={threshold}
          onChange={(e) => setThreshold(Number(e.target.value))}
          className="text-xs bg-muted border border-border rounded-lg px-2 py-1 text-muted-foreground"
        >
          <option value={5}>+5%</option>
          <option value={10}>+10%</option>
          <option value={15}>+15%</option>
          <option value={20}>+20%</option>
        </select>
        </label>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-20 text-sm text-muted-foreground">
          {t('priceTracking.loading')}
        </div>
      ) : alerts.length === 0 ? (
        <div className="text-sm text-muted-foreground text-center py-8">
          {t('priceTracking.emptyBefore')} {threshold}% {t('priceTracking.emptyAfter')}
        </div>
      ) : (
        <div className="space-y-2">
          {alerts.map((alert, i) => {
            const isIncrease = alert.changePercent > 0;
            const key = `${alert.productName}::${alert.vendorId}`;
            const isExpanded = expandedProduct === key;

            return (
              <div key={i} className="border border-border-subtle rounded-xl overflow-hidden">
                <button
                  onClick={() => toggleHistory(alert.productName, alert.vendorId)}
                  className="w-full flex items-center gap-3 p-3 hover:bg-muted transition-colors text-left"
                >
                  <div className={`p-1.5 rounded-lg ${isIncrease ? 'bg-red-500/10' : 'bg-green-500/10'}`}>
                    {isIncrease ? (
                      <TrendingUp className="w-4 h-4 text-red-400" />
                    ) : (
                      <TrendingDown className="w-4 h-4 text-green-400" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-foreground truncate">{alert.productName}</div>
                    <div className="text-xs text-muted-foreground">{alert.vendorName || t('priceTracking.unknownVendor')}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className={`text-sm font-bold ${isIncrease ? 'text-red-400' : 'text-green-400'}`}>
                      {isIncrease ? '+' : ''}{alert.changePercent.toFixed(1)}%
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      €{alert.previousPrice.toFixed(2)} → €{alert.currentPrice.toFixed(2)}
                    </div>
                  </div>
                  {isExpanded ? (
                    <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                  )}
                </button>

                {isExpanded && (
                  <div className="border-t border-border-subtle p-3 bg-surface">
                    {historyLoading ? (
                      <div className="text-xs text-muted-foreground text-center py-2">{t('priceTracking.historyLoading')}</div>
                    ) : priceHistory.length === 0 ? (
                      <div className="text-xs text-muted-foreground text-center py-2">{t('priceTracking.historyEmpty')}</div>
                    ) : (
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-xs font-medium text-muted-foreground mb-2">
                          <span>{t('priceTracking.historyTitle')}</span>
                          <span className="font-normal">
                            {t('priceTracking.unitTimesQuantity')}<InfoHint term="unitPrice" />
                          </span>
                        </div>
                        {priceHistory.map((point, j) => (
                          <div key={j} className="flex items-center justify-between text-xs">
                            <span className="text-muted-foreground">
                              {point.date ? new Date(point.date).toLocaleDateString('pt-PT') : '—'}
                            </span>
                            <span className="text-foreground font-medium">
                              €{point.unitPrice.toFixed(4)} × {point.quantity}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
