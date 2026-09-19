import type { DataStatus } from '@/lib/bitget/types';
export default function StatusBadge({ status }: {status: DataStatus}) { return <span className={`badge status-${status.toLowerCase()}`}><span className="dot" />{status}</span>; }
