import React, { useState } from 'react';
import axios from 'axios';

const API = 'https://scaling-engine-4j5797p45qxwf76q-5000.app.github.dev';

export default function ImportPanel({ onLessonsImported }) {
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  function handleDrop(e) {
    e.preventDefault();
    setDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped && dropped.type === 'application/pdf') {
      setFile(dropped);
      setResult(null);
      setError(null);
    } else {
      setError('Please drop a PDF file.');
    }
  }

  function handleFileInput(e) {
    const selected = e.target.files[0];
    if (selected) {
      setFile(selected);
      setResult(null);
      setError(null);
    }
  }

  async function handleUpload() {
    if (!file) return;
    setLoading(true);
    setError(null);
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await axios.post(`${API}/api/upload-pdf`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setResult(res.data);
      if (onLessonsImported) onLessonsImported(res.data.lessons);
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to parse PDF. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  function getLevelColor(level) {
    if (!level) return 'tag-grey';
    if (level.toLowerCase().includes('precomp')) return 'tag-yellow';
    if (level.toLowerCase().includes('adaptive')) return 'tag-red';
    return 'tag-aqua';
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Import Schedule</div>
          <div className="page-sub">Upload a Jackrabbit PDF to extract lesson and student data</div>
        </div>
      </div>

      {/* DROP ZONE */}
      <div
        className={`drop-zone ${dragging ? 'dragging' : ''} ${file ? 'has-file' : ''}`}
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => document.getElementById('pdf-input').click()}
      >
        <input
          id="pdf-input"
          type="file"
          accept=".pdf"
          style={{ display: 'none' }}
          onChange={handleFileInput}
        />
        <div className="drop-icon">{file ? '📄' : '📁'}</div>
        <div className="drop-title">
          {file ? file.name : 'Drop your Jackrabbit PDF here'}
        </div>
        <div className="drop-sub">
          {file ? `${(file.size / 1024).toFixed(1)} KB — click to change` : 'or click to browse'}
        </div>
      </div>

      {error && (
        <div className="card" style={{ borderColor: '#ff4d6d55', color: '#ff4d6d', margin: '16px 0' }}>
          {error}
        </div>
      )}

      {file && !result && (
        <div style={{ display: 'flex', justifyContent: 'center', margin: '20px 0' }}>
          <button className="btn btn-primary" onClick={handleUpload} disabled={loading}>
            {loading ? 'Parsing PDF...' : 'Parse PDF'}
          </button>
        </div>
      )}

      {/* RESULTS PREVIEW */}
      {result && (
        <div>
          <div className="stats-row" style={{ marginTop: 24 }}>
            <div className="stat-chip"><span className="stat-num">{result.count}</span> Lessons Found</div>
            <div className="stat-chip"><span className="stat-num">{result.lessons.filter(l => l.is_adaptive).length}</span> Adaptive</div>
            <div className="stat-chip"><span className="stat-num">{result.lessons.filter(l => l.is_group).length}</span> Semi-Private</div>
            <div className="stat-chip"><span className="stat-num">{result.lessons.filter(l => !l.instructor).length}</span> Need Assignment</div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '20px 0 12px' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700 }}>Parsed Lessons</div>
            <button className="btn btn-primary" onClick={() => onLessonsImported && onLessonsImported(result.lessons)}>
              Generate Schedule →
            </button>
          </div>

          <div className="lessons-list">
            {result.lessons.map((lesson, idx) => (
              <div className="lesson-card" key={idx}>
                <div className="lesson-card-left">
                  <div className="lesson-time">{lesson.start_time}</div>
                  <div className={`tag ${lesson.is_adaptive ? 'tag-red' : lesson.is_group ? 'tag-yellow' : 'tag-aqua'}`} style={{ marginTop: 6 }}>
                    {lesson.is_adaptive ? 'Adaptive' : lesson.is_group ? 'Semi-Private' : 'Private'}
                  </div>
                </div>
                <div className="lesson-card-body">
                  {lesson.students && lesson.students.map((s, si) => (
                    <div key={si} className="student-row">
                      <span className="student-name">{s.first} {s.last}</span>
                      {s.age && <span className="student-age">{s.age}</span>}
                      {s.swim_level && <span className={`tag ${getLevelColor(s.swim_level)}`} style={{ fontSize: 10 }}>{s.swim_level}</span>}
                      {s.is_adaptive && <span className="tag tag-red" style={{ fontSize: 10 }}>Adaptive</span>}
                      {s.gender_preference && <span className="tag tag-grey" style={{ fontSize: 10 }}>{s.gender_preference} instructor</span>}
                      {s.style_preference && <span className="tag tag-grey" style={{ fontSize: 10 }}>{s.style_preference}</span>}
                      {s.roll_notes && <div className="student-notes">{s.roll_notes}</div>}
                    </div>
                  ))}
                </div>
                <div className="lesson-card-right">
                  {lesson.instructor ? (
                    <div className="assigned-badge">
                      <span className="tag tag-green">Locked: {lesson.instructor}</span>
                    </div>
                  ) : lesson.instructor_lock ? (
                    <span className="tag tag-yellow">Reserved: {lesson.instructor_lock}</span>
                  ) : (
                    <span className="tag tag-grey">Unassigned</span>
                  )}
                  {lesson.lane_preference && (
                    <div style={{ fontSize: 10, color: 'var(--grey)', marginTop: 6 }}>Lane: {lesson.lane_preference}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
