import { PageShell } from '@/components/PageShell';
import { KpiCard } from '@/components/KpiCard';
import { DataTable } from '@/components/DataTable';
import { safeQuery, num } from '@/lib/bigquery';
import { VIEWS, type SearchParams } from '@/lib/queries';
import { fmtInt, fmtPct } from '@/lib/format';

export const dynamic = 'force-dynamic';

const PENDING =
  'Appendix A not run yet — the source table isn’t synced to BigQuery. Widget is built and will populate automatically once the view exists.';

function pendingNote(error: string | null): string | undefined {
  if (!error) return undefined;
  return /not found|Not found|does not exist|Table.*not/i.test(error) ? PENDING : error;
}

export default async function OperationsPage(_: { searchParams: SearchParams }) {
  const pvr = await safeQuery<{
    preventive_count: unknown;
    reactive_count: unknown;
    preventive_pct: unknown;
  }>(`SELECT preventive_count, reactive_count, preventive_pct FROM \`${VIEWS.preventiveVsReactive}\``);

  const incidents = await safeQuery<{
    property: string | null;
    status: string | null;
    incident_count: unknown;
  }>(
    `SELECT property, status, incident_count
     FROM \`${VIEWS.incidents}\`
     ORDER BY incident_count DESC`,
  );

  const trainings = await safeQuery<{
    month: string | null;
    property_code: string | null;
    training_sessions: unknown;
    attendance_count: unknown;
  }>(
    `SELECT month, property_code, training_sessions, attendance_count
     FROM \`${VIEWS.trainings}\`
     ORDER BY month`,
  );

  const p = pvr.rows[0] ?? {};
  const incidentTotal = incidents.rows.reduce((s, r) => s + num(r.incident_count), 0);
  const sessionTotal = trainings.rows.reduce((s, r) => s + num(r.training_sessions), 0);
  const attendanceTotal = trainings.rows.reduce((s, r) => s + num(r.attendance_count), 0);

  return (
    <PageShell title="PPM · Incidents · Training">
      <KpiCard
        title="Preventive vs Reactive"
        value={pvr.error ? '—' : fmtPct(num(p.preventive_pct))}
        sub={
          pvr.error
            ? 'pending'
            : `${fmtInt(num(p.preventive_count))} PPM / ${fmtInt(num(p.reactive_count))} reactive`
        }
        span={4}
        error={null}
        note={pendingNote(pvr.error) ?? 'PPM logging is sparse vs complaint volume — ratio can look extreme.'}
      />
      <KpiCard
        title="Incidents Logged"
        value={incidents.error ? '—' : fmtInt(incidentTotal)}
        span={4}
        note={pendingNote(incidents.error) ?? 'Will stay at 0 until incident logging starts.'}
      />
      <KpiCard
        title="Training Sessions / Attendance"
        value={trainings.error ? '—' : fmtInt(sessionTotal)}
        sub={trainings.error ? 'pending' : `${fmtInt(attendanceTotal)} attended`}
        span={4}
        note={pendingNote(trainings.error)}
      />

      <DataTable
        title="Incidents by Property & Status"
        span={6}
        error={pendingNote(incidents.error) ?? null}
        columns={[
          { key: 'property', label: 'Property' },
          { key: 'status', label: 'Status' },
          {
            key: 'incident_count',
            label: 'Count',
            numeric: true,
            render: (r) => fmtInt(num(r.incident_count)),
          },
        ]}
        rows={incidents.rows}
        emptyText="No incidents logged."
      />

      <DataTable
        title="Trainings by Month & Property"
        span={6}
        error={pendingNote(trainings.error) ?? null}
        columns={[
          { key: 'month', label: 'Month' },
          { key: 'property_code', label: 'Property' },
          {
            key: 'training_sessions',
            label: 'Sessions',
            numeric: true,
            render: (r) => fmtInt(num(r.training_sessions)),
          },
          {
            key: 'attendance_count',
            label: 'Attended',
            numeric: true,
            render: (r) => fmtInt(num(r.attendance_count)),
          },
        ]}
        rows={trainings.rows}
        emptyText="No training records."
      />
    </PageShell>
  );
}
