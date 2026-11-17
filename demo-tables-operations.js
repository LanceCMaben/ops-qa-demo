(function (global) {
  'use strict';

  var today = new Date();
  function isoDaysAgo(n) {
    var d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - n);
    return d.toISOString().slice(0, 10);
  }

  var PARTNERS = ['Demo Riverside', 'Demo Lakeview', 'Demo Central', 'Demo Atlantic'];

  function buildPrograms() {
    var campaigns = ['CNVA', 'CNVD', 'AWR', 'CNVASC'];
    var rows = [];
    PARTNERS.forEach(function (p, pi) {
      campaigns.forEach(function (c, ci) {
        rows.push({
          PARTITION: p,
          PROGRAM_SOLUTION: c,
          CAMPAIGN_YEAR: 'CY26',
          INSTANCE_NUM: String(100 + pi * 10 + ci),
          PROGRAM_STATUS: 'Active',
          ACTIVE_FLAG: 'Y',
          FIRST_ACTIVITY: isoDaysAgo(120 + ci * 5),
          LAST_ACTIVITY: isoDaysAgo(2 + pi),
          DAYS_SINCE_LAST_TOUCHED: 2 + pi,
          PROGRAM_ID: 'p-' + pi + '-' + ci,
          CAMPAIGN_SOLUTION: c,
          PROGRAM_NAME: p + ' ' + c,
          NEVER_RUN: 'N',
          STALE: 'N',
          LAST_UPDATED: isoDaysAgo(1)
        });
      });
    });
    return rows;
  }

  function buildPartnerFiles() {
    return PARTNERS.map(function (p, i) {
      return {
        PARTITION: p,
        CLIENT: p,
        CAMPAIGN: 'CNVA',
        PROGRAM_SOLUTION: 'CNVA',
        CY: 'CY26',
        CAMPAIGN_YEAR: 'CY26',
        SOURCE_FILE_DATE: isoDaysAgo(3),
        FILE_NAME: p + '_CNVA_CY26_Apply.csv',
        TOTAL: 12000 + i * 800,
        APP_ST: 9000 + i * 100,
        APP_SUB: 7000 + i * 90,
        APP_COMP: 6500,
        ADM: 4200,
        DEP: 900,
        ENR: 800
      };
    });
  }

  function buildDownloads() {
    return PARTNERS.map(function (p, i) {
      return {
        CLIENT: p,
        PARTITION: p,
        CAMPAIGN: 'CNVA',
        CAMPAIGN_YEAR: 'CY26',
        CY: 'CY26',
        EVENT_DATE: isoDaysAgo(4 + i),
        DOWNLOAD_DATE: isoDaysAgo(4 + i),
        FILE_NAME: p + '_export.zip'
      };
    });
  }

  function buildLoadHistory() {
    return PARTNERS.map(function (p, i) {
      return {
        PARTITION: p,
        PROGRAM_SOLUTION: 'CNVA',
        CAMPAIGN_YEAR: 'CY26',
        MEMBERSHIP_DATE: isoDaysAgo(2 + i)
      };
    });
  }

  function buildLeads() {
    return PARTNERS.map(function (p, i) {
      return {
        PARTITION: p,
        PROGRAM_SOLUTION: 'CNVA',
        CAMPAIGN_YEAR: 'CY26',
        MEMBERSHIP_DATE: isoDaysAgo(1 + i)
      };
    });
  }

  function buildPrintBatches() {
    return [{
      PARTITION: 'Demo Riverside',
      PROGRAM_SOLUTION: 'CNVA',
      CAMPAIGN_YEAR: 'CY26',
      SENT_BATCH: 1,
      SENT_DEMAND: 500,
      CNV_SCORE: 75
    }];
  }

  function buildCampaignQa() {
    return [{
      PROGRAM_SOLUTION: 'CNVA',
      CF_CAMPAIGN_TYPE: 'Conversion Apply',
      CF_SOURCE_FILE_DATE: isoDaysAgo(5),
      SOURCE_FILE_DATE: isoDaysAgo(5)
    }];
  }

  function buildProgramMeta() {
    return [{ PARTITION: 'Demo Riverside', PROGRAM_SOLUTION: 'CNVA', META_KEY: 'demo', META_VALUE: '1' }];
  }

  function buildEmailSkew() { return [{ PARTITION: 'Demo Riverside', EVENT_DATE: isoDaysAgo(2) }]; }
  function buildPageViews() { return [{ PARTITION: 'Demo Riverside', VIEW_DATE: isoDaysAgo(1), PAGE_VIEWS: 42 }]; }

  global.registerOperationsDemoTables = function () {
    if (!global.DemoSqlEngine) return;
    DemoSqlEngine.registerTable('programs', buildPrograms());
    DemoSqlEngine.registerTable('partnerFiles', buildPartnerFiles());
    DemoSqlEngine.registerTable('downloads', buildDownloads());
    DemoSqlEngine.registerTable('loadHistory', buildLoadHistory());
    DemoSqlEngine.registerTable('leads', buildLeads());
    DemoSqlEngine.registerTable('printBatches', buildPrintBatches());
    DemoSqlEngine.registerTable('campaignQaInsights', buildCampaignQa());
    DemoSqlEngine.registerTable('programMeta', buildProgramMeta());
    DemoSqlEngine.registerTable('emailSkew', buildEmailSkew());
    DemoSqlEngine.registerTable('pageViews', buildPageViews());
  };
})(typeof window !== 'undefined' ? window : global);