# Northflank container-start correlation addendum

Project 6a8101e7-dc7a-4480-8ef4-3bb835aaba3f. Job 9fda40a6-66cd-4bfe-a9f3-01b0c92d16bb. Sources: saved read-only production evidence and user-provided Northflank log excerpts. No production action or new render was performed for this addendum.

## Timeline — 10 October 2026, Asia/Bangkok

04:03:06.640 job created.
04:03:33.338 last durable heartbeat.
04:03:49.000 container entrypoint starts (user log).
04:03:59.000 server listening on port 5001 (user log).
04:04:04.094 job becomes failed; user log at this second reports lease_recovery_end failedRows=1.

Last heartbeat to new container start: 15.662 seconds. Last heartbeat to server listening: 25.662 seconds. Last heartbeat to persisted failure: 30.756 seconds. Job lifetime: 57.454 seconds. With the default 30000 ms lease, expiry occurs at 04:04:03.338. Recovery polls at most every two seconds; completion at 04:04:04.094 is consistent. Startup immediately invokes recovery after the server starts, then periodically reconciles processing rows.

## Confirmed versus inferred

Confirmed from evidence: a backend container starts during this job's heartbeat gap; the durable job later fails at 0%, with no cancellation and no metrics. Its exact error is the recovery code's fail_expired message. The transition lines up with the generic aggregate recovery event and the default lease boundary.

Strong inference: a lost original worker was not resumed by the started backend, and its abandoned lease was failed by recovery. A container replacement/restart is now a much stronger explanation than before. Full owner/container identity is still missing. A new container start may be a rollout replacement, process crash restart, probe restart or extra replica; it alone does not prove that the original worker container was restarted. lease_recovery_end contains aggregate counts, not affected job IDs, so matching the one row/event is a timestamp correlation rather than a direct per-job recovery log.

Not confirmed: OOM, deployment-triggered restart, FFmpeg crash, CPU starvation or database interruption. No OOMKilled termination reason, oom_kill counter, exit status, deployed image identity or rollout event was supplied. Exit 137 alone means a SIGKILL-related exit and requires supporting OOM evidence. No ffmpeg_spawned/exit/close record was provided, so even whether FFmpeg started cannot be independently verified here. Zero progress does not establish a hung renderer: independent heartbeats operate below a 1% output increment.

The default total deadline is 30 minutes and the no-work watchdog 2 minutes; a 57-second lifetime does not match either default. Production overrides must still be checked. Raising only the total deadline cannot repair worker/container loss. Current database CHECK permits all lifecycle terminal statuses.

## Resource assessment

1 vCPU / 1024 MB is not validated reliable for this exact 180-second 1080p graph. The repository's prior one-minute Windows constrained run reported approximately 944 MiB combined peak commitment, already close to a 1024 MiB cap. Those Windows measurements are not Linux cgroup RAM or this workload's measured requirement. The actual three-minute graph instantiates 30 media inputs/30 GEQ animation branches/60 overlays, despite only 10 unique downloaded images. This materially expands filter/decoder state, but memory is not proven to scale linearly with video length. CPU and allocator behavior require Linux measurement.

Prior completed one-minute job recorded 1080.035 render seconds, about 1.6666 FPS. At that throughput, three minutes need roughly 54 minutes, before possible graph-growth overhead. This creates an independent risk under a 30-minute total deadline.

## Recommendation — not applied

First establish why the old owner disappeared: collect original container termination, rollout/probe events and resource metrics. If OOM is confirmed, increase memory and/or reduce simultaneously instantiated filter state. Start controlled validation at 2 vCPU / 4 GiB, one render slot, one Node process, FFMPEG_THREADS=1; treat this as a conservative test allocation, not a guarantee. Keep bounded total timeout (proposed 120 minutes), stall timeout (5 minutes) and lease timeout (90 seconds with heartbeats still every <=2 seconds). Do not use a longer lease to conceal OOM/restarts. Review measured SQL/heartbeat latency before changing lease margins. Do not change the existing animation implementation without quality/cancellation regression validation.

Keep long renders out of routine deployment/restart cycles. A separately managed durable render worker is a future architecture option; process-local jobs cannot transparently resume after container loss. Scaling replicas or increasing deadlines does not make interrupted FFmpeg jobs resumable.

## Missing evidence needed

For 10 October 2026 04:02–04:05 Asia/Bangkok (9 October 21:02–21:05 UTC), provide:
1. Original and newly started container IDs, replica count, restart count, old container termination reason and exit code; cgroup memory.events oom/oom_kill or explicit platform OOMKilled evidence.
2. Per-container memory limit/current/peak, CPU limit/use/throttling, and health-probe failures/events. Northflank charts sample at 15-second intervals; charts alone may miss short peaks, so termination evidence matters.
3. Image digest/revision for both containers, rollout/audit/scale events and shutdown logs; identical digest does not rule out all restart reasons.
4. Full safe lifecycle records for job 9fda40a6-66cd-4bfe-a9f3-01b0c92d16bb: registered/create_new, ffmpeg_spawned (childPid), heartbeat_failed/pending, stop_requested trigger, ffmpeg_exit/close, terminal events and recovery records. Include instance, processPid and hashed lease, never raw worker_token or credentials. Process PID alone can repeat across containers; instance UUID plus container ID is the correlation key.
5. Effective non-secret EXPORT_TIMEOUT_MS, EXPORT_STALL_TIMEOUT_MS, EXPORT_LEASE_TIMEOUT_MS, EXPORT_MAX_CONCURRENT_RENDERS, FFMPEG_THREADS and DB_* timeout settings.

No further production export is recommended until container continuity/resource headroom and the longer render budget are established. No new tests were needed for this evidence correlation; prior guarded validation remains 76 passed, 2 native-render tests skipped. Branch Jack and existing work preserved.

Official references: https://northflank.com/docs/v1/application/observe/monitor-containers ; https://northflank.com/docs/v1/application/observe/view-metrics ; https://northflank.com/docs/v1/application/observe/configure-health-checks ; https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/ .