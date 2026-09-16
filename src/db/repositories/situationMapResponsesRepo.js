const { getPool } = require('../index');

function mapRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    submissionId: row.submission_id,
    status: row.status,
    aiSummaryDraft: row.ai_summary_draft ?? null,
    aiSummaryPromptVersion: row.ai_summary_prompt_version ?? null,
    aiSummarySource: row.ai_summary_source ?? null,
    humanSummary: row.human_summary ?? null,
    responseDraft: row.response_draft ?? null,
    finalResponse: row.final_response ?? null,
    internalNotes: row.internal_notes ?? null,
    editedBy: row.edited_by ?? null,
    reviewedBy: row.reviewed_by ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    reviewedAt: row.reviewed_at ?? null,
    sentAt: row.sent_at ?? null,
  };
}

async function createPending(submissionId) {
  const pool = getPool();
  if (!pool) throw new Error('Database not configured');
  const id = Number(submissionId);
  if (!Number.isInteger(id) || id < 1) return null;

  try {
    const [result] = await pool.execute(
      `INSERT INTO situation_map_responses (submission_id, status)
       VALUES (?, 'pending')`,
      [id]
    );
    return { id: Number(result.insertId), created: true };
  } catch (err) {
    if (err && err.code === 'ER_DUP_ENTRY') {
      const existing = await findBySubmissionId(id);
      return existing ? { id: existing.id, created: false } : null;
    }
    throw err;
  }
}

async function findById(id) {
  const pool = getPool();
  if (!pool) throw new Error('Database not configured');
  const num = Number(id);
  if (!Number.isInteger(num) || num < 1) return null;
  const [rows] = await pool.execute(
    `SELECT * FROM situation_map_responses WHERE id = ? LIMIT 1`,
    [num]
  );
  return mapRow(rows[0]);
}

async function findBySubmissionId(submissionId) {
  const pool = getPool();
  if (!pool) throw new Error('Database not configured');
  const id = Number(submissionId);
  if (!Number.isInteger(id) || id < 1) return null;
  const [rows] = await pool.execute(
    `SELECT * FROM situation_map_responses WHERE submission_id = ? LIMIT 1`,
    [id]
  );
  return mapRow(rows[0]);
}

/**
 * Write-once AI draft. Returns updated row, or existing row if draft already set.
 */
async function setAiSummaryDraftIfEmpty(id, { draft, promptVersion, source, editedBy }) {
  const pool = getPool();
  if (!pool) throw new Error('Database not configured');
  const num = Number(id);
  if (!Number.isInteger(num) || num < 1) return null;

  const [result] = await pool.execute(
    `UPDATE situation_map_responses
     SET ai_summary_draft = ?,
         ai_summary_prompt_version = ?,
         ai_summary_source = ?,
         edited_by = COALESCE(?, edited_by),
         status = CASE WHEN status = 'pending' THEN 'drafting' ELSE status END
     WHERE id = ?
       AND (ai_summary_draft IS NULL OR TRIM(ai_summary_draft) = '')`,
    [
      String(draft || ''),
      promptVersion ? String(promptVersion).trim().slice(0, 64) : null,
      source ? String(source).trim().slice(0, 32) : null,
      editedBy ? String(editedBy).trim().slice(0, 80) : null,
      num,
    ]
  );

  const row = await findById(num);
  return { row, written: result.affectedRows > 0 };
}

async function updateEditorFields(id, fields) {
  const pool = getPool();
  if (!pool) throw new Error('Database not configured');
  const num = Number(id);
  if (!Number.isInteger(num) || num < 1) return null;

  const sets = [];
  const params = [];

  if (Object.prototype.hasOwnProperty.call(fields, 'humanSummary')) {
    sets.push('human_summary = ?');
    params.push(fields.humanSummary == null ? null : String(fields.humanSummary));
  }
  if (Object.prototype.hasOwnProperty.call(fields, 'responseDraft')) {
    sets.push('response_draft = ?');
    params.push(fields.responseDraft == null ? null : String(fields.responseDraft));
  }
  if (Object.prototype.hasOwnProperty.call(fields, 'internalNotes')) {
    sets.push('internal_notes = ?');
    params.push(fields.internalNotes == null ? null : String(fields.internalNotes));
  }
  if (Object.prototype.hasOwnProperty.call(fields, 'status')) {
    sets.push('status = ?');
    params.push(String(fields.status));
  }
  if (Object.prototype.hasOwnProperty.call(fields, 'finalResponse')) {
    sets.push('final_response = ?');
    params.push(fields.finalResponse == null ? null : String(fields.finalResponse));
  }
  if (Object.prototype.hasOwnProperty.call(fields, 'reviewedAt')) {
    sets.push('reviewed_at = ?');
    params.push(fields.reviewedAt);
  }
  if (Object.prototype.hasOwnProperty.call(fields, 'reviewedBy')) {
    sets.push('reviewed_by = ?');
    params.push(fields.reviewedBy ? String(fields.reviewedBy).trim().slice(0, 80) : null);
  }
  if (Object.prototype.hasOwnProperty.call(fields, 'sentAt')) {
    sets.push('sent_at = ?');
    params.push(fields.sentAt);
  }
  if (Object.prototype.hasOwnProperty.call(fields, 'editedBy')) {
    sets.push('edited_by = ?');
    params.push(fields.editedBy ? String(fields.editedBy).trim().slice(0, 80) : null);
  }

  if (!sets.length) return findById(num);

  params.push(num);
  await pool.execute(
    `UPDATE situation_map_responses SET ${sets.join(', ')} WHERE id = ?`,
    params
  );
  return findById(num);
}

module.exports = {
  mapRow,
  createPending,
  findById,
  findBySubmissionId,
  setAiSummaryDraftIfEmpty,
  updateEditorFields,
};
