import React from 'react';

export const Card: React.FC<{ children: React.ReactNode; className?: string; title?: string }> = ({ children, className = '', title }) => (
  <div className={`bg-slate-900 rounded-xl shadow-lg border border-slate-800 overflow-hidden ${className}`}>
    {title && (
      <div className="px-6 py-4 border-b border-slate-800 bg-slate-900/50">
        <h3 className="text-lg font-semibold text-slate-100">{title}</h3>
      </div>
    )}
    <div className="p-6">{children}</div>
  </div>
);

export const SectionHeader: React.FC<{ title: string; subtitle?: string }> = ({ title, subtitle }) => (
  <div className="mb-6">
    <h2 className="text-2xl font-bold text-white tracking-tight">{title}</h2>
    {subtitle && <p className="text-slate-400 mt-1">{subtitle}</p>}
  </div>
);

export const Badge: React.FC<{ children: React.ReactNode; type?: 'success' | 'danger' | 'neutral' | 'info' }> = ({ children, type = 'neutral' }) => {
  const styles = {
    success: 'bg-emerald-950/50 text-emerald-400 border-emerald-900',
    danger: 'bg-rose-950/50 text-rose-400 border-rose-900',
    neutral: 'bg-slate-800 text-slate-300 border-slate-700',
    info: 'bg-blue-950/50 text-blue-400 border-blue-900',
  };
  return (
    <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium border ${styles[type]}`}>
      {children}
    </span>
  );
};

export const InsightBox: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="bg-amber-950/20 border-l-4 border-amber-500/60 p-4 rounded-r-lg mb-6">
    <h4 className="text-sm font-bold text-amber-500 uppercase tracking-wider mb-2">{title}</h4>
    <div className="text-amber-200/90 text-sm space-y-1">
      {children}
    </div>
  </div>
);

interface TableProps {
  headers: string[];
  children: React.ReactNode;
}

export const DataTable: React.FC<TableProps> = ({ headers, children }) => (
  <div className="overflow-x-auto rounded-lg border border-slate-800">
    <table className="min-w-full divide-y divide-slate-800">
      <thead className="bg-slate-950/50">
        <tr>
          {headers.map((h, i) => (
            <th key={i} scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="bg-slate-900 divide-y divide-slate-800">
        {children}
      </tbody>
    </table>
  </div>
);

export const TableRow: React.FC<{ children: React.ReactNode; index: number }> = ({ children, index }) => (
  <tr className={`hover:bg-slate-800/60 transition-colors ${index % 2 === 0 ? 'bg-slate-900' : 'bg-slate-800/20'}`}>
    {children}
  </tr>
);

export const TableCell: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <td className={`px-6 py-4 whitespace-nowrap text-sm text-slate-300 ${className}`}>
    {children}
  </td>
);
