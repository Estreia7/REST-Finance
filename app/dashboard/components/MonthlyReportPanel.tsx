'use client';

import { useState } from 'react';
import { FileText, Download, Loader2 } from 'lucide-react';
import InfoHint from '@/app/components/InfoHint';

const MONTH_NAMES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

export default function MonthlyReportPanel() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [downloading, setDownloading] = useState(false);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const res = await fetch(`/api/export/pdf?month=${month}&year=${year}`);
      if (!res.ok) throw new Error('Erro ao gerar PDF');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `relatorio-${year}-${String(month).padStart(2, '0')}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert('Erro ao gerar o relatório. Tente novamente.');
    }
    setDownloading(false);
  };

  return (
    <div className="card-glass p-6">
      <div className="flex items-center gap-2 mb-5">
        <FileText className="w-5 h-5 text-primary" />
        <h2 className="text-lg font-bold text-foreground">
          Relatório Mensal PDF<InfoHint term="monthlyReport" />
        </h2>
      </div>

      {/* "P&L e KPIs" is the jargon this whole pass exists to remove. */}
      <p className="text-sm text-muted-foreground mb-6">
        Um PDF com as contas fechadas do mês escolhido: o que vendeu, o que gastou em
        mercadorias e despesas, e o que sobrou no fim. Pronto a enviar ao contabilista
        ou ao banco.
      </p>

      <div className="flex items-end gap-4 mb-6">
        <div>
          <label className="text-xs font-medium text-muted-foreground block mb-2">Mês</label>
          <select value={month} onChange={e => setMonth(parseInt(e.target.value))} className="input-field">
            {MONTH_NAMES.map((name, i) => (
              <option key={i} value={i + 1}>{name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground block mb-2">Ano</label>
          <select value={year} onChange={e => setYear(parseInt(e.target.value))} className="input-field">
            {Array.from({ length: 5 }, (_, i) => now.getFullYear() - 2 + i).map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
        <button onClick={handleDownload} disabled={downloading} className="cta-button py-2.5 px-5 text-sm">
          {downloading ? <><Loader2 className="w-4 h-4 animate-spin" /> A gerar...</> : <><Download className="w-4 h-4" /> Descarregar PDF</>}
        </button>
      </div>

      <div className="p-3 rounded-lg bg-warning/5 border border-warning/20 text-xs text-amber-400">
        Este relatório é mais preciso quando todas as entradas diárias do mês foram registadas.
      </div>
    </div>
  );
}
