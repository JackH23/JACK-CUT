// Existing tables must be migrated explicitly; never repair schema drift at startup.
function assertExportDeadlineSchema(columns) {
  const column = columns.deadline_at;
  const type = String(column?.type || '').trim().toUpperCase();
  if (!column || !['TIMESTAMP WITH TIME ZONE', 'TIMESTAMPTZ'].includes(type) ||
      column.allowNull !== true || column.defaultValue != null) {
    throw new Error('Apply/verify the explicit export deadline migration: deadline_at must be nullable timestamptz with no default.');
  }
}
module.exports = { assertExportDeadlineSchema };
