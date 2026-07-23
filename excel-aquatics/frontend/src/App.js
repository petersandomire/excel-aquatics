import React, { useState } from 'react';
import InstructorPanel from './pages/InstructorPanel';
import ImportPanel from './pages/ImportPanel';
import AvailabilityPanel from './pages/AvailabilityPanel';
import SchedulePanel from './pages/SchedulePanel';
import './App.css';

const PAGES = [
  { id: 'instructors', label: 'Instructors', icon: '👤' },
  { id: 'import', label: 'Import Data', icon: '📁' },
  { id: 'availability', label: 'Availability', icon: '🕐' },
  { id: 'schedule', label: 'Schedule', icon: '📅' },
];

export default function App() {
  const [activePage, setActivePage] = useState('instructors');
  const [importedLessons, setImportedLessons] = useState([]);
  const [availability, setAvailability] = useState([]);

  function handleLessonsImported(lessons) {
    setImportedLessons(lessons);
    setActivePage('availability');
  }

  function handleAvailabilityContinue(avail) {
    setAvailability(avail);
    setActivePage('schedule');
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="logo-mark">EA</div>
          <div>
            <div className="logo-title">Excel Aquatics</div>
            <div className="logo-sub">Scheduling Tool</div>
          </div>
        </div>
        <nav className="sidebar-nav">
          {PAGES.map(p => (
            <button
              key={p.id}
              className={`nav-item ${activePage === p.id ? 'active' : ''} ${p.disabled ? 'disabled' : ''}`}
              onClick={() => !p.disabled && setActivePage(p.id)}
              title={p.disabled ? 'Coming in a future phase' : ''}
            >
              <span className="nav-icon">{p.icon}</span>
              <span>{p.label}</span>
              {p.disabled && <span className="nav-badge">Soon</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">Phase 3 of 11</div>
      </aside>

      <main className="main-content">
        {activePage === 'instructors' && <InstructorPanel />}
        {activePage === 'import' && (
          <ImportPanel onLessonsImported={handleLessonsImported} />
        )}
        {activePage === 'availability' && (
          <AvailabilityPanel lessons={importedLessons} onContinue={handleAvailabilityContinue} />
        )}
        {activePage === 'schedule' && (
          <SchedulePanel lessons={importedLessons} availability={availability} />
        )}
      </main>
    </div>
  );
}
