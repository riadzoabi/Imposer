const BASE = '/api';

export async function uploadPDF(file: File): Promise<any> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${BASE}/upload`, { method: 'POST', body: form });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'Upload failed');
  }
  return res.json();
}

export async function getPreview(
  sessionId: string,
  config: any,
  sheetNumber: number = 1,
  side: string = 'front',
): Promise<any> {
  const params = new URLSearchParams({
    session_id: sessionId,
    sheet_number: String(sheetNumber),
    side,
  });
  const res = await fetch(`${BASE}/preview?${params}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'Preview failed');
  }
  return res.json();
}

export async function imposePDF(sessionId: string, config: any): Promise<Blob> {
  const res = await fetch(`${BASE}/impose?session_id=${sessionId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'Imposition failed');
  }
  return res.blob();
}

export async function listPresets(): Promise<any> {
  const res = await fetch(`${BASE}/presets/list`);
  return res.json();
}

export async function getPreset(id: string): Promise<any> {
  const res = await fetch(`${BASE}/presets/${id}`);
  return res.json();
}

export async function savePreset(name: string, config: any): Promise<any> {
  const res = await fetch(`${BASE}/presets/save`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, config }),
  });
  return res.json();
}
