# Operations QA

**Repo home:** [`eee_internal_insights`](https://github.com/3enrollment/eee_internal_insights) → folder `Ops_QA/`  
**Portal:** 3E Insights Portal · ClearSquare **Development → internal** (Dev card). Prod is internal-only.

**Team process:** [../PROCESS.md](../PROCESS.md)

Internal card that runs dataset checks for each **3E Operations** chapter. Before a run, the card shows the **check catalog** and a **dataset strip** (no SQL). Click **Run checks**. Progress stays on a slim bar so results stay on screen. Fail is empty or broken data. Warn is a date older than the check allows. **Click Fail or Warn** for the drawer. **Copy failures** copies every Fail and Warn. Chapter chips jump to that chapter. **Needs attention** hides passing checks. **Export report** downloads the full run.

| | Value |
|---|--------|
| Prod design | `Operations QA` · `2cb4fa91-ad9c-49d3-a9b1-1a3a61b77150` |
| Dev design | `DEV Operations QA` · `07c1e4d1-539b-48e0-b661-81f4187509d3` |
| Version | 0.0.9 |

## What a run checks

A failed check marks its chapter Fail. A stale date marks Warn (the KPI will not say Pass). Empty tables and query errors stay Fail. The line under a check says what the query returned.

| Chapter | Checks |
|---------|--------|
| Partner Data Health | Activity columns return a row. Active status matches the chapter chips (Active, not Inactive or Development). Newest active `LAST_ACTIVITY` is within 14 days. Partner files, downloads (`EVENT_DATE` or `DOWNLOAD_DATE`), daily load, and leads each return a row |
| Print Batches | The chapter columns (`PARTITION`, `PROGRAM_SOLUTION`, `CAMPAIGN_YEAR`, `SENT_BATCH`, `SENT_DEMAND`, `CNV_SCORE`) return a row, and `CAMPAIGN_YEAR` includes the current cycle (`2026` / `CY26` through July 2027; the year rolls in August) |
| Campaign Upload QA | Enrollment Metrics returns a row. `CNVA` is on `PROGRAM_SOLUTION`, or Conversion Apply is on `CF_CAMPAIGN_TYPE`. Newest source file date (`CF_SOURCE_FILE_DATE`, then `SOURCE_FILE_DATE`, then `EXTRACT_TIME`) is within 21 days. XPL leads with `MEMBERSHIP_DATE` is the fallback |
| Campaign Timelines | A program outside the `z_` sandbox has `PARTITION`, `PROGRAM_SOLUTION`, `CAMPAIGN_YEAR`, `FIRST_ACTIVITY`, and `LAST_ACTIVITY` |
| Campaign Load History | Leads have `MEMBERSHIP_DATE` on the chart columns, and the newest date is within 14 days |
| Program Meta | Program meta returns partner, campaign, year, and status. An Active status exists. Email skew has `PERCENTAGE_DIFF`. Downloads have `EVENT_DATE` or `DOWNLOAD_DATE` |
| Insights Activity | Portal activity has `page_name`, and the newest `act_date` is within 7 days |
| Documentation | Static chapter. Always passes, with no dataset query |

Row checks use `LIMIT 1` so a large dataset is not fully counted. Active status uses the same Active / Inactive / Development reading as 3E Operations. Freshness, active counts, and the print-year check ignore partitions whose name starts with `z_`.

These checks query the same dataset **aliases** as 3E Operations (`programs`, `programMeta`, …). They never retry with a dataset UUID; that is not a valid SQL alias and produced DA0004. They do not open the other cards or click through the portal.

**Export report** downloads an Excel file after a run finishes. Fail and Warn rows are listed first. The Message column is the exact check text, including the SQL error when a query fails.

## Publish (from this folder)

```bash
cd Ops_QA

npx --yes ryuu -m manifest.dev.json publish

# Prod — only from main after Dev looks good.
npx --yes ryuu -m manifest.json publish
```

Bump `version` in the manifest you are publishing before each publish. The first Dev publish omits `id` so Ryuu creates the design and writes it back. Hard-refresh the portal after deploy.

Map all ten dataset aliases on the card if Domo does not pick them up from the manifest. Portal page filters must use `PARTITION`, not `CLIENT`.

## Node / vendor

`package.json` and `vendor/domo.js`. Do not commit `node_modules`.
