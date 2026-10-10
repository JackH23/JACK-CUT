// Read the running process environment per request. Platform updates are not live toggles.
function exportSubmissionGuard(req, res, next) {
  const paused = String(process.env.EXPORT_SUBMISSIONS_PAUSED || '').trim().toLowerCase() === 'true';
  if (!paused) return next();

  return res.status(503).json({
    code: 'EXPORT_SUBMISSIONS_PAUSED',
    message: 'Video exports are temporarily paused for maintenance. Existing exports can continue. Please try again later.',
  });
}

module.exports = exportSubmissionGuard;
