# Salary-inclusive labor reporting

Homebase timecard `labor.costs` remains the source for clocked labor. The dashboard
adds a separate salary allocation from `HomebaseSalaryHistory`. Timecard daily and
hourly rollups deliberately remain timecard-only; rebuilding them cannot erase or
double-count salary allocations.

## Salary history and sync

Every Homebase timecard sync fetches all pages of the location's Employees API,
including manual historical timecard syncs. Active `salary` jobs are stored by
Homebase job ID and location. No names, emails, PINs, or other employee profile
fields are stored in salary history.

On the first successful salary sync, current rates establish a baseline effective
**2026-09-13**. Applying current rates retrospectively is an explicitly approved
approximation, not historical data supplied by Homebase. Later changes create a
complete salary roster snapshot effective on the location's current business date.
Repeated polls on that date replace its observation; earlier dates remain intact.
Archiving, removing, or changing a job to hourly ends its salary allocation from
the newly observed date. A manual sync of old timecards never backdates a newly
observed pay change. Errors fetching/validating employees leave existing history
intact and are reported as salary sync failures.

## Calculation policy

- Annual rate / 52 / 7 (364) per business date. This is the accepted assumption
  based on the supplied Homebase report, not a documented Homebase allocation rule.
- Use the latest snapshot effective on or before each date. No salary allocation
  before September 13, before the first snapshot, or on future business dates.
- Allocate a full day's salary on a started business day, even without timecards.
  This matches the supplied report's full salary amount for the in-progress day.
- If that job still has an hourly timecard on a day, keep its recorded hourly cost
  and omit its salary addition for that day. This avoids doubling transition-day pay.
- Deduct any salary cost already supplied on that job's timecards from its daily
  addition (minimum zero). Never change raw timecard costs or paid hours.
- Hourly presentation spreads the daily allocation evenly across 24 business-hour
  slots. This is a reporting convention; Homebase's exact hourly distribution has
  not been verified. Partial hourly charts show only the buckets in their range.

KPIs, all-location totals, hourly breakdowns, sales/labor trends, goal actuals, and
alerts using those KPIs all use the salary-inclusive read paths. Saved dashboard
responses are expired when rates change. Direct timecard rollup parity checks
remain timecard-only.

## Initialize/backfill existing reports

From `server`, preview live rates without writing salary history:

```sh
npm run backfill-homebase-salaries
```

Apply to all configured Homebase locations (or add `--locationId <Mongo ID>`):

```sh
npm run backfill-homebase-salaries -- --apply
```

The script fetches and validates every selected roster before writing. Existing
September 13 baselines are preserved on reruns. The script also expires dashboard
caches, including all-location views. There is no need to rewrite historical
timecards or rebuild timecard rollups: their costs are combined with dated salary
history at read time. The normal scheduled sync also initializes missing baselines.

For the supplied example: `(48000 + 4000 + 5000 + 6666.66) / 364 = 174.9084` per
day. Adding Sunday's `96.96` timecard cost yields `271.8684`, displayed as `$272`.

Validation: `npm run test:homebase-salary`, `npm run type-check`, `npm run build`.
