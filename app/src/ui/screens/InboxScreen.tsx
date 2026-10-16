import { useEffect, useState } from 'react';
import { openSaveDatabase } from '../../data/db';
import './PlaceholderScreen.css';

type DbStatus = 'checking' | 'ready' | 'error';

export function InboxScreen() {
  const [dbStatus, setDbStatus] = useState<DbStatus>('checking');

  useEffect(() => {
    const db = openSaveDatabase('scaffold-check');
    db.open()
      .then(() => setDbStatus('ready'))
      .catch(() => setDbStatus('error'));
    return () => db.close();
  }, []);

  return (
    <div className="screen">
      <h1 className="screen-header">Inbox</h1>
      <div className="card">
        <span className="milestone-badge">Milestone 0</span>
        <h2 className="card-title">Scaffolding complete</h2>
        <p className="card-body">
          The app shell, offline storage and PWA install are wired up. No world data is
          imported yet — that lands in Milestone 1, along with the real inbox: match
          results, press requests and promise deadlines will show up here.
        </p>
      </div>
      <div className="card">
        <h2 className="card-title">Offline storage</h2>
        <p className="card-body">
          {dbStatus === 'checking' && 'Checking IndexedDB…'}
          {dbStatus === 'ready' && 'IndexedDB is working — saves will persist offline.'}
          {dbStatus === 'error' && 'Could not open IndexedDB in this browser.'}
        </p>
      </div>
    </div>
  );
}
