import React, { useState, useEffect } from 'react';
import axios from 'axios';

const API = 'https://scaling-engine-4j5797p45qxwf76q-5000.app.github.dev/api';

const AGE_GROUPS = ['Toddler (1-3)', 'Young Child (3-5)', 'Child (5-8)', 'Older Child (8-12)', 'Teen/Adult (12+)'];
const SWIM_LEVELS = ['Level 1', 'Level 2', 'Level 3', 'Level 4', 'Level 5', 'Level 6', 'Precomp'];
const EXPERIENCE_TIERS = ['Junior', 'Mid-Level', 'Senior', 'Lead'];
const ROLES = ['Instructor', 'Supervisor', 'Dedicated Lifeguard', 'Manager'];
const GENDERS = ['Male', 'Female', 'Non-binary', 'Prefer not to say'];

const EMPTY_FORM = {
  name: '', gender: '', role: 'Instructor', lifeguard_certified: false,
  age_group_proficiencies: [], swim_level_proficiencies: [], adaptive_capable: false,
  adult_capable: false,
  experience_tier: '', teaching_style_tags: '', max_daily_lessons: 6, notes: '',
  custom_fields: {}
};

function getInitials(name) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

function getRoleTag(role) {
  const map = {
    'Instructor': 'tag-aqua',
    'Supervisor': 'tag-yellow',
    'Dedicated Lifeguard': 'tag-green',
    'Manager': 'tag-red',
  };
  return map[role] || 'tag-grey';
}

export default function InstructorPanel() {
  const [instructors, setInstructors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [search, setSearch] = useState('');
  const [filterRole, setFilterRole] = useState('');
  const [customFieldKey, setCustomFieldKey] = useState('');
  const [customFieldVal, setCustomFieldVal] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  useEffect(() => { fetchInstructors(); }, []);

  async function fetchInstructors() {
    try {
      setLoading(true);
      setError(null);
      const res = await axios.get(`${API}/instructors`);
      setInstructors(res.data);
    } catch (e) {
      setError('Cannot connect to the backend server. Make sure it is running on port 5000.');
    } finally {
      setLoading(false);
    }
  }

  function openAdd() {
    setForm(EMPTY_FORM);
    setEditTarget(null);
    setShowModal(true);
  }

  function openEdit(inst) {
    setForm({
      ...inst,
      lifeguard_certified: !!inst.lifeguard_certified,
      adaptive_capable: !!inst.adaptive_capable,
      adult_capable: !!inst.adult_capable,
      age_group_proficiencies: inst.age_group_proficiencies || [],
      swim_level_proficiencies: inst.swim_level_proficiencies || [],
      custom_fields: inst.custom_fields || {}
    });
    setEditTarget(inst.id);
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setEditTarget(null);
    setCustomFieldKey('');
    setCustomFieldVal('');
  }

  function handleChange(field, value) {
    setForm(f => ({ ...f, [field]: value }));
  }

  function toggleMultiSelect(field, value) {
    setForm(f => {
      const current = f[field] || [];
      const updated = current.includes(value)
        ? current.filter(v => v !== value)
        : [...current, value];
      return { ...f, [field]: updated };
    });
  }

  function addCustomField() {
    if (!customFieldKey.trim()) return;
    setForm(f => ({
      ...f,
      custom_fields: { ...f.custom_fields, [customFieldKey.trim()]: customFieldVal.trim() }
    }));
    setCustomFieldKey('');
    setCustomFieldVal('');
  }

  function removeCustomField(key) {
    setForm(f => {
      const cf = { ...f.custom_fields };
      delete cf[key];
      return { ...f, custom_fields: cf };
    });
  }

  async function handleSave() {
    if (!form.name.trim()) return alert('Name is required.');
    try {
      if (editTarget) {
        await axios.put(`${API}/instructors/${editTarget}`, form);
      } else {
        await axios.post(`${API}/instructors`, form);
      }
      closeModal();
      fetchInstructors();
    } catch (e) {
      alert('Error saving instructor. Is the backend running?');
    }
  }

  async function handleDelete(id) {
    try {
      await axios.delete(`${API}/instructors/${id}`);
      setDeleteConfirm(null);
      fetchInstructors();
    } catch (e) {
      alert('Error deleting instructor.');
    }
  }

  const filtered = instructors.filter(i => {
    const matchSearch = i.name.toLowerCase().includes(search.toLowerCase());
    const matchRole = filterRole ? i.role === filterRole : true;
    return matchSearch && matchRole;
  });

  const stats = {
    total: instructors.length,
    instructors: instructors.filter(i => i.role === 'Instructor').length,
    lifeguards: instructors.filter(i => i.lifeguard_certified).length,
    adaptive: instructors.filter(i => i.adaptive_capable).length,
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Instructors</div>
          <div className="page-sub">Manage staff profiles, certifications, and proficiency levels</div>
        </div>
        <button className="btn btn-primary" onClick={openAdd}>+ Add Instructor</button>
      </div>

      <div className="stats-row">
        <div className="stat-chip"><span className="stat-num">{stats.total}</span> Total Staff</div>
        <div className="stat-chip"><span className="stat-num">{stats.instructors}</span> Instructors</div>
        <div className="stat-chip"><span className="stat-num">{stats.lifeguards}</span> LG Certified</div>
        <div className="stat-chip"><span className="stat-num">{stats.adaptive}</span> Adaptive Capable</div>
      </div>

      <div className="search-bar">
        <div className="search-input-wrap">
          <span className="search-icon">🔍</span>
          <input
            className="search-input"
            placeholder="Search by name..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select className="filter-select" value={filterRole} onChange={e => setFilterRole(e.target.value)}>
          <option value="">All Roles</option>
          {ROLES.map(r => <option key={r}>{r}</option>)}
        </select>
      </div>

      {error && (
        <div className="card" style={{ borderColor: '#ff4d6d55', color: '#ff4d6d', marginBottom: 20 }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ color: 'var(--grey)', textAlign: 'center', padding: 60 }}>Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">🏊</div>
          <div className="empty-state-title">{instructors.length === 0 ? 'No instructors yet' : 'No results found'}</div>
          <div className="empty-state-sub">{instructors.length === 0 ? 'Add your first instructor to get started.' : 'Try adjusting your search or filter.'}</div>
          {instructors.length === 0 && <button className="btn btn-primary" onClick={openAdd}>+ Add Instructor</button>}
        </div>
      ) : (
        <div className="instructor-grid">
          {filtered.map(inst => (
            <div className="instructor-card" key={inst.id}>
              <div className="instructor-card-header">
                <div className="instructor-avatar">{getInitials(inst.name)}</div>
                <div>
                  <div className="instructor-name">{inst.name}</div>
                  <div className="instructor-role">{inst.gender ? `${inst.gender} · ` : ''}{inst.experience_tier || 'No tier set'}</div>
                </div>
              </div>
              <div className="instructor-tags">
                <span className={`tag ${getRoleTag(inst.role)}`}>{inst.role}</span>
                {inst.lifeguard_certified ? <span className="tag tag-green">Lifeguard</span> : null}
                {inst.adaptive_capable ? <span className="tag tag-yellow">Adaptive</span> : null}
                {inst.adult_capable ? <span className="tag tag-yellow">Adult Lessons</span> : null}
                {(inst.age_group_proficiencies || []).map(a => (
                  <span key={a} className="tag tag-grey">{a}</span>
                ))}
                {(inst.swim_level_proficiencies || []).map(l => (
                  <span key={l} className="tag tag-grey">{l}</span>
                ))}
                {inst.teaching_style_tags && inst.teaching_style_tags.split(',').map(t => t.trim()).filter(Boolean).map(t => (
                  <span key={t} className="tag tag-grey">{t}</span>
                ))}
                {Object.entries(inst.custom_fields || {}).map(([k, v]) => (
                  <span key={k} className="tag tag-grey">{k}: {v}</span>
                ))}
              </div>
              {inst.notes && (
                <div style={{ fontSize: 11, color: 'var(--grey)', marginBottom: 14, lineHeight: 1.5 }}>
                  {inst.notes}
                </div>
              )}
              <div style={{ fontSize: 11, color: 'var(--grey)', marginBottom: 12 }}>
                Max daily lessons: <span style={{ color: 'var(--aqua)' }}>{inst.max_daily_lessons}</span>
              </div>
              <div className="instructor-card-actions">
                <button className="btn btn-ghost btn-sm" onClick={() => openEdit(inst)}>Edit</button>
                <button className="btn btn-danger btn-sm" onClick={() => setDeleteConfirm(inst)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && closeModal()}>
          <div className="modal">
            <div className="modal-header">
              <div className="modal-title">{editTarget ? 'Edit Instructor' : 'Add Instructor'}</div>
              <button className="modal-close" onClick={closeModal}>X</button>
            </div>

            <div className="form-grid">
              <div className="form-section"><div className="form-section-title">Basic Info</div></div>

              <div className="form-group full">
                <label className="form-label">Full Name *</label>
                <input className="form-input" value={form.name} onChange={e => handleChange('name', e.target.value)} placeholder="e.g. Maya Johnson" />
              </div>

              <div className="form-group">
                <label className="form-label">Gender</label>
                <select className="form-select" value={form.gender} onChange={e => handleChange('gender', e.target.value)}>
                  <option value="">Not specified</option>
                  {GENDERS.map(g => <option key={g}>{g}</option>)}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Role</label>
                <select className="form-select" value={form.role} onChange={e => handleChange('role', e.target.value)}>
                  {ROLES.map(r => <option key={r}>{r}</option>)}
                </select>
              </div>

              <div className="form-section"><div className="form-section-title">Certifications</div></div>

              <div className="form-group">
                <label className="form-toggle">
                  <input type="checkbox" checked={form.lifeguard_certified} onChange={e => handleChange('lifeguard_certified', e.target.checked)} />
                  <span className="form-toggle-label">Lifeguard Certified</span>
                </label>
              </div>

              <div className="form-group">
                <label className="form-toggle">
                  <input type="checkbox" checked={form.adaptive_capable} onChange={e => handleChange('adaptive_capable', e.target.checked)} />
                  <span className="form-toggle-label">Adaptive / Special Needs Capable</span>
                </label>
              </div>

              <div className="form-group full">
                <label className="form-toggle">
                  <input type="checkbox" checked={form.adult_capable} onChange={e => handleChange('adult_capable', e.target.checked)} />
                  <span className="form-toggle-label">Able to Teach Adult Lessons</span>
                </label>
              </div>

              <div className="form-section">
                <div className="form-section-title">Age Group Proficiency <span style={{color:'var(--grey)',fontWeight:400,textTransform:'none'}}>(select all that apply)</span></div>
                <div className="checkbox-grid">
                  {AGE_GROUPS.map(a => (
                    <label key={a} className={`checkbox-chip ${form.age_group_proficiencies.includes(a) ? 'checked' : ''}`}>
                      <input
                        type="checkbox"
                        checked={form.age_group_proficiencies.includes(a)}
                        onChange={() => toggleMultiSelect('age_group_proficiencies', a)}
                      />
                      {a}
                    </label>
                  ))}
                </div>
              </div>

              <div className="form-section">
                <div className="form-section-title">Swim Level Proficiency <span style={{color:'var(--grey)',fontWeight:400,textTransform:'none'}}>(select all that apply)</span></div>
                <div className="checkbox-grid">
                  {SWIM_LEVELS.map(l => (
                    <label key={l} className={`checkbox-chip ${form.swim_level_proficiencies.includes(l) ? 'checked' : ''}`}>
                      <input
                        type="checkbox"
                        checked={form.swim_level_proficiencies.includes(l)}
                        onChange={() => toggleMultiSelect('swim_level_proficiencies', l)}
                      />
                      {l}
                    </label>
                  ))}
                </div>
              </div>

              <div className="form-section">
                <div className="form-section-title">Other</div>
              </div>

              <div className="form-group">
                <label className="form-label">Experience Tier</label>
                <select className="form-select" value={form.experience_tier} onChange={e => handleChange('experience_tier', e.target.value)}>
                  <option value="">Not specified</option>
                  {EXPERIENCE_TIERS.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Max Daily Lessons</label>
                <input className="form-input" type="number" min={1} max={12} value={form.max_daily_lessons} onChange={e => handleChange('max_daily_lessons', parseInt(e.target.value))} />
              </div>

              <div className="form-group full">
                <label className="form-label">Teaching Style Tags <span style={{color:'var(--grey)',fontWeight:400,textTransform:'none'}}>(comma separated)</span></label>
                <input className="form-input" value={form.teaching_style_tags} onChange={e => handleChange('teaching_style_tags', e.target.value)} placeholder="e.g. dynamic, firm, patient" />
              </div>

              <div className="form-group full">
                <label className="form-label">Notes</label>
                <textarea className="form-textarea" value={form.notes} onChange={e => handleChange('notes', e.target.value)} placeholder="Any additional notes about this instructor..." />
              </div>

              <div className="form-section">
                <div className="form-section-title">Custom Fields</div>
                {Object.entries(form.custom_fields).map(([k, v]) => (
                  <div className="custom-field-row" key={k}>
                    <input className="form-input" value={k} readOnly style={{ flex: '0 0 140px', opacity: 0.7 }} />
                    <input className="form-input" value={v} onChange={e => setForm(f => ({ ...f, custom_fields: { ...f.custom_fields, [k]: e.target.value } }))} />
                    <button className="btn btn-danger btn-sm" onClick={() => removeCustomField(k)}>X</button>
                  </div>
                ))}
                <div className="custom-field-row">
                  <input className="form-input" placeholder="Field name" value={customFieldKey} onChange={e => setCustomFieldKey(e.target.value)} style={{ flex: '0 0 140px' }} />
                  <input className="form-input" placeholder="Value" value={customFieldVal} onChange={e => setCustomFieldVal(e.target.value)} />
                  <button className="btn btn-ghost btn-sm" onClick={addCustomField}>+ Add</button>
                </div>
              </div>
            </div>

            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={closeModal}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave}>{editTarget ? 'Save Changes' : 'Add Instructor'}</button>
            </div>
          </div>
        </div>
      )}

      {deleteConfirm && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setDeleteConfirm(null)}>
          <div className="modal" style={{ maxWidth: 400 }}>
            <div className="modal-header">
              <div className="modal-title">Delete Instructor?</div>
              <button className="modal-close" onClick={() => setDeleteConfirm(null)}>X</button>
            </div>
            <p style={{ color: 'var(--grey)', fontSize: 14, lineHeight: 1.6 }}>
              Are you sure you want to delete <strong style={{ color: 'var(--white)' }}>{deleteConfirm.name}</strong>? This cannot be undone.
            </p>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => setDeleteConfirm(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={() => handleDelete(deleteConfirm.id)}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
