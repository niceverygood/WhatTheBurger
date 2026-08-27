'use client';

import { useRouter } from 'next/navigation';

export default function StorePicker({
  stores, current,
}: {
  stores: { id: string; code: string; name: string }[];
  current: string;
}) {
  const router = useRouter();
  return (
    <div className="field">
      <label htmlFor="kstore">지점</label>
      <select
        id="kstore"
        className="ctl"
        style={{ maxWidth: 200 }}
        value={current}
        onChange={(e) => router.push(`/kiosk-link?store=${e.target.value}`)}
      >
        {stores.map((s) => (
          <option key={s.id} value={s.id}>{s.code} · {s.name}</option>
        ))}
      </select>
    </div>
  );
}
