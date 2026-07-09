import { ChevronUp, ChevronDown, ChevronsUpDown, Search, X } from 'lucide-react';
import { useState, useMemo, ReactNode } from 'react';

export interface Column<T> {
  key: string;
  label: string;
  sortable?: boolean;
  width?: string;
  render?: (row: T) => ReactNode;
}

interface TableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyExtractor: (row: T) => string;
  loading?: boolean;
  searchable?: boolean;
  searchPlaceholder?: string;
  onRowClick?: (row: T) => void;
  pageSize?: number;
  emptyMessage?: string;
  emptyAction?: ReactNode;
}

export function Table<T extends Record<string, any>>({
  columns,
  data,
  keyExtractor,
  loading = false,
  searchable = false,
  searchPlaceholder = 'Search…',
  onRowClick,
  pageSize = 20,
  emptyMessage,
  emptyAction,
}: TableProps<T>) {
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(0);

  const toggleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const filtered = useMemo(() => {
    let items = data;
    if (search) {
      const q = search.toLowerCase();
      items = items.filter((row) =>
        columns.some((col) => {
          const val = row[col.key];
          return val != null && String(val).toLowerCase().includes(q);
        })
      );
    }
    if (sortKey) {
      items = [...items].sort((a, b) => {
        const aVal = a[sortKey];
        const bVal = b[sortKey];
        if (aVal == null) return 1;
        if (bVal == null) return -1;
        const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
        return sortDir === 'asc' ? cmp : -cmp;
      });
    }
    return items;
  }, [data, search, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginated = filtered.slice(page * pageSize, (page + 1) * pageSize);

  if (page >= totalPages) setPage(Math.max(0, totalPages - 1));

  if (loading) {
    return (
      <div className="card overflow-hidden">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3.5 border-b last:border-0" style={{ borderColor: 'var(--border)' }}>
            {columns.map((col) => (
              <div key={col.key} className="skeleton h-4" style={{ width: col.width || '100px' }} />
            ))}
          </div>
        ))}
      </div>
    );
  }

  if (filtered.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-icon">
          <Search className="w-5 h-5" style={{ color: 'var(--text-muted)' }} />
        </div>
        <p className="text-title mb-2">{emptyMessage || 'No data found'}</p>
        {emptyAction && <div className="mt-4">{emptyAction}</div>}
      </div>
    );
  }

  return (
    <div>
      {searchable && (
        <div className="relative mb-4">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: 'var(--text-disabled)' }} />
          <input
            type="search"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            placeholder={searchPlaceholder}
            className="input pl-10"
          />
          {search && (
            <button className="absolute right-3.5 top-1/2 -translate-y-1/2" onClick={() => { setSearch(''); setPage(0); }}>
              <X className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
            </button>
          )}
        </div>
      )}

      <div className="card overflow-hidden">
        <div className="hidden md:block">
          <div className="flex items-center gap-4 px-4 py-2.5 border-b" style={{ borderColor: 'var(--border)', background: 'var(--bg-elevated)' }}>
            {columns.map((col) => (
              <button
                key={col.key}
                onClick={() => col.sortable && toggleSort(col.key)}
                className="flex items-center gap-1 text-label select-none"
                style={{ cursor: col.sortable ? 'pointer' : 'default', width: col.width || '100px', flex: col.width ? '0 0 auto' : '1', minWidth: col.width || 0 }}
              >
                {col.label}
                {col.sortable && (
                  sortKey === col.key ? (
                    sortDir === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
                  ) : (
                    <ChevronsUpDown className="w-3 h-3" style={{ opacity: 0.4 }} />
                  )
                )}
              </button>
            ))}
          </div>
        </div>

        <div>
          {paginated.map((row, idx) => (
            <div
              key={keyExtractor(row)}
              onClick={() => onRowClick?.(row)}
              className="flex items-center gap-4 px-4 py-3.5 border-b last:border-0 transition-colors duration-100"
              style={{
                borderColor: 'var(--border)',
                background: idx % 2 === 0 ? 'transparent' : 'var(--bg-elevated)',
                cursor: onRowClick ? 'pointer' : 'default',
              }}
              onMouseEnter={(e) => onRowClick && (e.currentTarget.style.background = 'var(--bg-subtle)')}
              onMouseLeave={(e) => { e.currentTarget.style.background = idx % 2 === 0 ? 'transparent' : 'var(--bg-elevated)'; }}
            >
              {columns.map((col) => (
                <div
                  key={col.key}
                  className="text-sm truncate"
                  style={{ width: col.width || '100px', flex: col.width ? '0 0 auto' : '1', minWidth: col.width || 0, color: 'var(--text)' }}
                >
                  {col.render ? col.render(row) : row[col.key] ?? '—'}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-caption">
            Showing {page * pageSize + 1}–{Math.min((page + 1) * pageSize, filtered.length)} of {filtered.length}
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(Math.max(0, page - 1))}
              disabled={page === 0}
              className="btn btn-secondary btn-sm"
            >
              Previous
            </button>
            <button
              onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
              disabled={page >= totalPages - 1}
              className="btn btn-secondary btn-sm"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
